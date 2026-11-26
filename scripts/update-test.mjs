// PWA の更新 (新しい版への切り替え) のテスト。
// 版 A を開いた状態でサーバーの中身を版 B に差し替え、各場面で B に切り替わるかを確かめる。
// 使い方: node scripts/update-test.mjs [--from <古いコードのディレクトリ>]
//   --from を付けると、版 A をそのディレクトリのコードでビルドする (古いコードからの移行の確認用)
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = resolve(import.meta.dirname, '..');
const fromIdx = process.argv.indexOf('--from');
const ROOT_A = fromIdx > 0 ? resolve(process.argv[fromIdx + 1]) : ROOT;
const MIGRATION = ROOT_A !== ROOT;
const PORT = 4185;
const BASE = `http://localhost:${PORT}/study_morse/`;

function build(root, version) {
  execSync('node node_modules/vite/bin/vite.js build', {
    cwd: root,
    env: { ...process.env, BASE_PATH: '/study_morse/', APP_VERSION: version },
    stdio: 'ignore',
  });
}

async function serve(root) {
  const p = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: root,
    env: { ...process.env, BASE_PATH: '/study_morse/' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('preview server did not start')), 15000);
    p.stdout.on('data', (d) => {
      if (String(d).includes(String(PORT))) {
        clearTimeout(t);
        res();
      }
    });
  });
  return p;
}

const version = (page) => page.evaluate(() => document.body.textContent.match(/v9\.0\.0-[AB]/)?.[0] ?? null);
const waitForB = (page, ms) =>
  page
    .waitForFunction(() => document.body.textContent.includes('v9.0.0-B'), null, { timeout: ms })
    .then(() => true)
    .catch(() => false);

const failures = [];
const check = (ok, msg) => {
  console.log(ok ? '  ✓' : '  ✗', msg);
  if (!ok) failures.push(msg);
};

/** 版 A を開き、B を公開してから act(page) を実行する */
async function scenario(title, startHash, act) {
  console.log(title);
  build(ROOT_A, '9.0.0-A');
  let server = await serve(ROOT_A);
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.goto(BASE + startHash);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    server.kill();
    build(ROOT, '9.0.0-B');
    server = await serve(ROOT);
    await act(page);
  } catch (e) {
    check(false, String(e));
  } finally {
    check(errors.length === 0, `ページの例外なし ${errors.length ? errors[0] : ''}`);
    await browser.close();
    server.kill();
  }
}

const resume = (page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

if (!MIGRATION) {
  await scenario('バックグラウンドから戻っただけで切り替わる', '#/settings', async (page) => {
    await resume(page);
    check(await waitForB(page, 15000), `戻ったら新しい版になる (${await version(page)})`);
    check(await page.isVisible('text=新しいバージョン (v9.0.0-B) に更新しました'), '更新したことを知らせる');
  });

  await scenario('練習中は切り替えを待ち、練習画面を出たら切り替わる', '#/koch?lesson=1', async (page) => {
    // 読み込み直すとハッシュは残るので、ページ内の目印が消えたかで読み込み直しを判定する
    await page.evaluate(() => (window.__marker = true));
    await resume(page);
    await page.waitForFunction(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      return !r.installing && !r.waiting;
    }, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(4000);
    check(await page.evaluate(() => window.__marker === true), '新しい版が有効になっても練習画面では読み込み直さない');
    await page.evaluate(() => (location.hash = '/'));
    const reloaded = await page
      .waitForFunction(() => window.__marker !== true && document.body.textContent.includes('Koch 法 講座'), null, { timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    check(reloaded, '練習画面を出たところで読み込み直す');
    await page.evaluate(() => (location.hash = '/settings'));
    check(await waitForB(page, 15000), `新しい版になっている (${await version(page)})`);
  });

  await scenario('起動し直すと切り替わる', '#/settings', async (page) => {
    await page.reload();
    check(await waitForB(page, 15000), `起動し直したら新しい版になる (${await version(page)})`);
  });

  await scenario('設定の「アップデートを確認」で切り替わる', '#/settings', async (page) => {
    await page.click('text=アップデートを確認');
    check(await waitForB(page, 15000), `確認ボタンで新しい版になる (${await version(page)})`);
  });
} else {
  await scenario('古いコードから: 起動し直すと修正版に切り替わる', '#/settings', async (page) => {
    await page.reload();
    check(await waitForB(page, 15000), `起動し直したら修正版になる (${await version(page)})`);
  });
}

console.log(failures.length ? `\n${failures.length} 件失敗` : '\nすべて成功');
process.exit(failures.length ? 1 : 0);
