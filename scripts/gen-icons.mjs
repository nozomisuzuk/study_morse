// アイコン PNG を SVG から生成する (Playwright の Chromium でレンダリング)
// 使い方: node scripts/gen-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

// Playwright は環境に入っているものを使う (package.json の依存には含めない)
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BG = '#0f1720';
const FG = '#f5a524';

/** 中央に "K" (−・−) の符号と電波のアーチ。rounded=false はマスク用に全面塗り */
function svg({ rounded }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="${BG}"/>
  <g transform="translate(0 22)">
  <g fill="${FG}">
    <rect x="100" y="262" width="118" height="56" rx="28"/>
    <circle cx="256" cy="290" r="28"/>
    <rect x="294" y="262" width="118" height="56" rx="28"/>
  </g>
  <g fill="none" stroke="${FG}" stroke-linecap="round">
    <path d="M196 206 a 84 84 0 0 1 120 0" stroke-width="18" opacity=".9"/>
    <path d="M160 170 a 136 136 0 0 1 192 0" stroke-width="18" opacity=".55"/>
  </g>
  </g>
</svg>`;
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/favicon.svg', svg({ rounded: true }));

const browser = await chromium.launch();
const page = await browser.newPage();
const targets = [
  { file: 'public/icons/icon-192.png', size: 192, rounded: true },
  { file: 'public/icons/icon-512.png', size: 512, rounded: true },
  { file: 'public/icons/maskable-512.png', size: 512, rounded: false },
  { file: 'public/icons/apple-touch-icon.png', size: 180, rounded: false },
];
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg({ rounded: t.rounded }).replace('<svg ', `<svg width="${t.size}" height="${t.size}" `)}</body></html>`,
  );
  await page.screenshot({ path: t.file, omitBackground: true, clip: { x: 0, y: 0, width: t.size, height: t.size } });
  console.log('wrote', t.file);
}
await browser.close();
