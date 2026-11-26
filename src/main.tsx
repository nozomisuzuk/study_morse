import { render } from 'preact';
import { App } from './app';
import { audio } from './audio/engine';
import { initPwa } from './pwa';
import './styles.css';

render(<App />, document.getElementById('app')!);

// ブラウザの自動再生制限: 最初の操作で AudioContext を有効にしておく。
// タッチの pointerdown は「ユーザー操作」に数えられないので、pointerup / click でも試す。
const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;
const unlock = () => {
  if (audio.unlock()) for (const ev of UNLOCK_EVENTS) window.removeEventListener(ev, unlock, true);
};
for (const ev of UNLOCK_EVENTS) window.addEventListener(ev, unlock, true);

// オフラインで動かすための Service Worker と、新しい版への自動切り替え (src/pwa.ts)
initPwa();
