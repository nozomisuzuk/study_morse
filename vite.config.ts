/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// GitHub Pages では https://<user>.github.io/<repo>/ 配下で配信されるため、
// CI で BASE_PATH=/study_morse/ を渡す。ローカルでは "/"。
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  define: {
    // APP_VERSION はテスト (更新の確認) 用の上書き。通常は package.json の version
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION ?? pkg.version),
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'モールス受信トレーナー',
        short_name: 'CWトレーナー',
        description: 'アマチュア無線でモールス (CW) を聞き取れるようになるための練習アプリ',
        lang: 'ja',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f1720',
        theme_color: '#0f1720',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 新しい版を待機させずにすぐ有効にする。
        // (プラグインは injectRegister が auto のときだけこれを自動で入れるが、
        //  ここでは登録を src/pwa.ts で自前で行うため injectRegister: false にしており、明示が必要)
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
