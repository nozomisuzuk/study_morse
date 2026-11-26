import { signal } from '@preact/signals';

/** ハッシュ (#/koch?lesson=3 など) によるルーティング。GitHub Pages でもサーバー設定なしで動く。 */
export interface Route {
  path: string;
  query: URLSearchParams;
}

function parse(): Route {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(qs ?? '') };
}

export const route = signal<Route>(typeof location === 'undefined' ? { path: '/', query: new URLSearchParams() } : parse());

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    route.value = parse();
    window.scrollTo(0, 0);
  });
}

/** 練習中の画面 (タブバーを隠してキーパッドの場所を確保する) */
export const SESSION_PATHS: ReadonlySet<string> = new Set(['/koch', '/icr', '/words', '/calls', '/qso']);

export function inSession(): boolean {
  return SESSION_PATHS.has(route.value.path);
}

export function navigate(path: string): void {
  if (location.hash === `#${path}`) return;
  location.hash = path;
}
