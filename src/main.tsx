import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';
import { audio } from './audio/engine';
import './styles.css';

render(<App />, document.getElementById('app')!);

// ブラウザの自動再生制限: 最初の操作で AudioContext を有効にしておく。
// タッチの pointerdown は「ユーザー操作」に数えられないので、pointerup / click でも試す。
const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;
const unlock = () => {
  if (audio.unlock()) for (const ev of UNLOCK_EVENTS) window.removeEventListener(ev, unlock, true);
};
for (const ev of UNLOCK_EVENTS) window.addEventListener(ev, unlock, true);

// オフラインで動かすための Service Worker。新しい版があれば裏で更新し、次回起動時に反映される。
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  registerSW({ immediate: true });
}
