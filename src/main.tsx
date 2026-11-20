import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';
import { audio } from './audio/engine';
import './styles.css';

render(<App />, document.getElementById('app')!);

// ブラウザの自動再生制限: 最初のタップで AudioContext を有効にしておく
const unlock = () => {
  audio.unlock();
  window.removeEventListener('pointerdown', unlock, true);
  window.removeEventListener('keydown', unlock, true);
};
window.addEventListener('pointerdown', unlock, true);
window.addEventListener('keydown', unlock, true);

// オフラインで動かすための Service Worker。新しい版があれば裏で更新し、次回起動時に反映される。
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  registerSW({ immediate: true });
}
