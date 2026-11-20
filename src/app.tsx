import { useEffect } from 'preact/hooks';
import type { JSX } from 'preact';
import { settings } from './state/store';
import { navigate, route } from './ui/router';
import { Home } from './ui/screens/Home';
import { Practice } from './ui/screens/Practice';
import { KochLesson } from './ui/screens/KochLesson';
import { Icr } from './ui/screens/Icr';
import { Words } from './ui/screens/Words';
import { Calls } from './ui/screens/Calls';
import { Qso } from './ui/screens/Qso';
import { Free } from './ui/screens/Free';
import { Reference } from './ui/screens/Reference';
import { Stats } from './ui/screens/Stats';
import { Settings } from './ui/screens/Settings';

const SCREENS: Record<string, () => JSX.Element | null> = {
  '/': Home,
  '/practice': Practice,
  '/koch': KochLesson,
  '/icr': Icr,
  '/words': Words,
  '/calls': Calls,
  '/qso': Qso,
  '/free': Free,
  '/ref': Reference,
  '/stats': Stats,
  '/settings': Settings,
};

/** 練習中はタブバーを隠してキーパッドの場所を確保する */
const FULLSCREEN = new Set(['/koch', '/icr', '/words', '/calls', '/qso']);

const TABS: { path: string; label: string; icon: JSX.Element; match: string[] }[] = [
  {
    path: '/',
    label: '学習',
    match: ['/', '/koch'],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 10.5 12 4l9 6.5" />
        <path d="M5 9.5V20h14V9.5" />
      </svg>
    ),
  },
  {
    path: '/practice',
    label: '練習',
    match: ['/practice', '/icr', '/words', '/calls', '/qso', '/free'],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M3 12h2M8 12h6M17 12h4" />
        <path d="M3 7h6M12 7h2M17 7h4M3 17h2M8 17h2M13 17h8" opacity=".55" />
      </svg>
    ),
  },
  {
    path: '/ref',
    label: '資料',
    match: ['/ref'],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
        <path d="M5 4h10l4 4v12H5z" />
        <path d="M9 12h6M9 16h6" stroke-linecap="round" />
      </svg>
    ),
  },
  {
    path: '/stats',
    label: '記録',
    match: ['/stats'],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M5 20V12M12 20V5M19 20v-9" />
      </svg>
    ),
  },
  {
    path: '/settings',
    label: '設定',
    match: ['/settings'],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="10" cy="17" r="2" />
      </svg>
    ),
  },
];

export function App() {
  const { path } = route.value;
  const theme = settings.value.theme;

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  const Screen = SCREENS[path] ?? Home;
  const fullscreen = FULLSCREEN.has(path);

  return (
    <>
      <main class={`app ${fullscreen ? 'fullscreen' : ''}`}>
        <Screen />
      </main>
      {!fullscreen && (
        <nav class="tabbar" aria-label="メイン">
          <div class="tabbar-inner">
            {TABS.map((t) => (
              <button key={t.path} class={`tab ${t.match.includes(path) ? 'active' : ''}`} onClick={() => navigate(t.path)} aria-current={t.match.includes(path) ? 'page' : undefined}>
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </nav>
      )}
    </>
  );
}
