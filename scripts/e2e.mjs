// スマホ幅の Chromium で主要な画面を一通り操作する E2E テスト。
// 再生される音声バッファをページ内でモールス解読し、その結果を入力して採点が正しく動くかを確かめる。
// 使い方: npm run build (BASE_PATH=/study_morse/) のあと node scripts/e2e.mjs [--shots <dir>]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { MORSE, isProsign, tokenLabel } from '../src/core/morse.ts';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = '/study_morse/';
const PORT = 4179;
const URL = `http://localhost:${PORT}${BASE}`;
const shotsIdx = process.argv.indexOf('--shots');
const SHOTS = shotsIdx > 0 ? process.argv[shotsIdx + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const DARK = process.argv.includes('--dark');
const scaleIdx = process.argv.indexOf('--scale');
const SCALE = scaleIdx > 0 ? Number(process.argv[scaleIdx + 1]) : 1;
const WPM = 30;
const REVERSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

/** ページに注入: AudioBufferSourceNode.start を横取りして、鳴らすバッファを解読する */
function initScript({ reverse, unit }) {
  window.__decoded = [];
  window.__starts = 0;
  window.__ctxs = [];
  const Ctx = window.AudioContext;
  window.AudioContext = class extends Ctx {
    constructor(...a) {
      super(...a);
      window.__ctxs.push(this);
    }
  };
  const decode = (data, sr) => {
    const win = Math.max(1, Math.round(sr * 0.002));
    const blocks = Math.floor(data.length / win);
    const runs = [];
    let cur = null;
    for (let b = 0; b < blocks; b++) {
      let m = 0;
      for (let j = b * win; j < (b + 1) * win; j++) m = Math.max(m, Math.abs(data[j]));
      const on = m > 0.12;
      if (!cur || cur.on !== on) {
        cur = { on, n: 0 };
        runs.push(cur);
      }
      cur.n++;
    }
    let text = '';
    let code = '';
    for (const r of runs) {
      const len = (r.n * win) / sr;
      if (r.on) code += len > 2 * unit ? '-' : '.';
      else if (len > 2 * unit && code) {
        text += reverse[code] ?? '#';
        code = '';
        if (len > 5 * unit) text += ' ';
      }
    }
    if (code) text += reverse[code] ?? '#';
    return text.trim();
  };
  const orig = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    window.__starts++;
    const b = this.buffer;
    if (b && b.length > 1 && !this.loop) window.__decoded.push(decode(b.getChannelData(0), b.sampleRate));
    return orig.apply(this, args);
  };
}

const failures = [];
const check = (cond, msg) => {
  if (cond) console.log('  ✓', msg);
  else {
    console.log('  ✗', msg);
    failures.push(msg);
  }
};

// npx を挟むと終了時に子プロセスが残るので、vite を直接起動する
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], {
  env: { ...process.env, BASE_PATH: BASE },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('preview server did not start')), 15000);
  server.stderr.on('data', (d) => process.stderr.write(d));
  server.stdout.on('data', (d) => {
    if (String(d).includes(String(PORT))) {
      clearTimeout(t);
      resolve();
    }
  });
});

// 実機と同じ既定の自動再生ポリシーで動かす (音声の有効化処理も検査するため)
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: SCALE,
  isMobile: true,
  hasTouch: true,
  locale: 'ja-JP',
  colorScheme: DARK ? 'dark' : 'light',
});
await context.addInitScript(initScript, { reverse: REVERSE, unit: 1.2 / WPM });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
const tap = (locator) => locator.dispatchEvent('pointerdown');
const waitDecoded = async (n, timeout = 20000) => {
  await page.waitForFunction((k) => window.__decoded.length >= k, n, { timeout });
  return page.evaluate((k) => window.__decoded[k - 1], n);
};
const typeText = async (text) => {
  for (const t of text.match(/<[A-Z]+>|\S/g) ?? []) {
    const label = isProsign(t) ? `略符号 ${tokenLabel(t)}` : t;
    await tap(page.locator(`.keypad button.key[aria-label="${label.replace(/"/g, '\\"')}"]`).first());
  }
};

try {
  // 速く終わるよう、設定を小さくしておく
  await page.goto(URL);
  await page.evaluate((wpm) => {
    localStorage.setItem(
      'study-morse:settings:v1',
      JSON.stringify({ charWpm: wpm, effWpm: wpm, groupsPerSession: 5, groupLen: 5, conditionsOn: { koch: false, icr: false, words: false, calls: false, qso: false }, icrCount: 20 }),
    );
  }, WPM);
  await page.reload();

  console.log('ホーム');
  await page.waitForSelector('text=Koch 法 講座');
  check(await page.isVisible('text=レッスン 1 を始める'), 'レッスン 1 のボタンが出る');
  await shot('01-home');

  console.log('Koch レッスン 1: まとめて聞く (既定) で合格してレッスン 2 を解放');
  // 最初の操作はタッチ (タッチの pointerdown はユーザー操作に数えられないので、その対策を検査する)
  await page.tap('text=レッスン 1 を始める');
  await page.waitForSelector('text=新しい文字の音を聞く');
  check(await page.isVisible('.segmented button.on:has-text("まとめて聞く")'), '既定は「まとめて聞く」');
  await shot('02-koch-intro');
  await page.tap('text=練習を始める');
  const ctxState = await page
    .waitForFunction(() => window.__ctxs[0]?.state === 'running', null, { timeout: 5000 })
    .then(() => 'running')
    .catch(() => page.evaluate(() => window.__ctxs[0]?.state ?? 'none'));
  check(ctxState === 'running', `タップ操作で AudioContext が有効になる (${ctxState})`);
  let decodedCount = await page.evaluate(() => window.__decoded.length);
  await page.waitForFunction((k) => window.__decoded.length >= k + 5, decodedCount, { timeout: 30000 });
  const streamTexts = await page.evaluate((k) => window.__decoded.slice(k, k + 5), decodedCount);
  decodedCount += 5;
  check(streamTexts.every((t) => /^[KM]{5}$/.test(t)), `5 グループを解読: ${streamTexts.join(' ')}`);
  for (const t of streamTexts) await typeText(t);
  await shot('03-koch-stream');
  await page.click('text=採点する');
  await page.waitForSelector('text=レッスン 1 の結果', { timeout: 15000 });
  check(await page.isVisible('.result-big:has-text("100%")'), '結果が 100%');
  check(await page.isVisible('text=レッスン 2 へ進む'), 'レッスン 2 が解放される');
  await shot('04-koch-result');
  const lesson = await page.evaluate(() => JSON.parse(localStorage.getItem('study-morse:progress:v1')).kochLesson);
  check(lesson === 2, `保存された進捗 kochLesson=${lesson}`);

  console.log('Koch レッスン 2: 1 グループずつ (確認用)');
  await page.click('text=レッスン 2 へ進む');
  await page.click('text=1 グループずつ (確認用)');
  await page.click('text=練習を始める');
  for (let g = 0; g < 5; g++) {
    const text = await waitDecoded(decodedCount + 1);
    decodedCount++;
    if (g === 0) {
      check(!(await page.isVisible('text=正解を聞き直す')) && !(await page.isVisible('text=もう一度聞く')), '答える前は聞き直せない');
    }
    if (g === 1) {
      // 何も入力しないと、音が終わって 1.5 秒で締め切られて自動採点される
      await page.waitForSelector('.diff', { timeout: 10000 });
      const missed = await page.locator('.diff .cell.del').count();
      check(missed === 5, `入力しないと締め切りで自動採点 (聞き逃し ${missed} 文字): ${text}`);
      check(await page.isVisible('text=正解を聞き直す'), '採点後は正解を聞き直せる');
      await shot('03-koch-group-deadline');
      await page.waitForSelector('.diff', { state: 'detached', timeout: 10000 });
      continue;
    }
    check(/^[KMU]{5}$/.test(text), `グループ ${g + 1} を解読: ${text}`);
    await typeText(text);
    await page.waitForSelector('.diff', { timeout: 5000 });
    check((await page.locator('.diff .cell.match').count()) === 5, `グループ ${g + 1} が全問正解`);
    if (g < 4) await page.waitForSelector('.diff', { state: 'detached', timeout: 10000 });
  }
  await page.waitForSelector('text=レッスン 2 の結果', { timeout: 15000 });
  check(await page.isVisible('.result-big:has-text("80%")'), '確認用の結果は 80% (1 グループ聞き逃し)');
  check(await page.isVisible('text=合格判定はしていません'), '確認用モードでは合格判定しない');
  check(!(await page.isVisible('text=レッスン 3 へ進む')), 'レッスン 3 は解放されない');
  const lesson2 = await page.evaluate(() => JSON.parse(localStorage.getItem('study-morse:progress:v1')).kochLesson);
  check(lesson2 === 2, `進捗はレッスン 2 のまま (kochLesson=${lesson2})`);
  await page.click('text=ホームに戻る');

  console.log('瞬時認識ドリル');
  await page.goto(`${URL}#/icr`);
  await page.click('text=全文字');
  await page.click('button:has-text("始める")');
  for (let i = 0; i < 3; i++) {
    const t = await waitDecoded(decodedCount + 1);
    decodedCount++;
    await typeText(t);
    await page.waitForSelector('.big-char.ok', { timeout: 3000 });
    check(true, `1 文字を解読して正解: ${t}`);
    if (i === 0) await shot('05-icr');
  }
  await page.locator('.topbar .icon-btn').click();

  console.log('単語・略語');
  await page.goto(`${URL}#/words`);
  // 習得済みだけだと語が少ないので OFF にする
  const learnedToggle = page.locator('.field:has-text("習得済みの文字だけで出題") input');
  if (await learnedToggle.isChecked()) await learnedToggle.locator('xpath=..').click();
  await page.click('button:has-text("始める")');
  const w = await waitDecoded(decodedCount + 1);
  decodedCount++;
  await typeText(w);
  await shot('06-words');
  await tap(page.locator('.keypad .key.submit'));
  await page.waitForSelector('.diff');
  check((await page.locator('.diff .cell.sub, .diff .cell.del, .diff .cell.ins').count()) === 0, `語を解読して正解: ${w}`);

  console.log('コールサイン');
  await page.goto(`${URL}#/calls`);
  await page.click('button:has-text("始める")');
  const c = await waitDecoded(decodedCount + 1);
  decodedCount++;
  await typeText(c);
  await shot('07-calls');
  await tap(page.locator('.keypad .key.submit'));
  await page.waitForSelector('.diff');
  check((await page.locator('.diff .cell.sub, .diff .cell.del, .diff .cell.ins').count()) === 0, `コールサインを解読して正解: ${c}`);
  const faster = await page
    .waitForFunction((w) => document.querySelector('.session-info')?.textContent?.includes(`${w} WPM`), WPM + 2, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  check(faster, '正解で速度が +2 WPM');

  console.log('交信 (CQ)');
  await page.goto(`${URL}#/qso`);
  await page.click('button:has-text("聞いてみる")');
  const cq = await waitDecoded(decodedCount + 1, 30000);
  decodedCount++;
  const m = cq.match(/DE (\S+)/);
  check(!!m, `CQ を解読: ${cq}`);
  if (m) await typeText(m[1]);
  await shot('08-qso-listen');
  await page.click('button:has-text("答え合わせ")');
  await page.waitForSelector('.result-big');
  check(await page.isVisible('.result-big:has-text("1 / 1")'), 'CQ のコールサインが正解');
  await shot('09-qso-review');

  console.log('定型 QSO を見ながら聞く');
  await page.goto(`${URL}#/practice`);
  await page.goto(`${URL}#/qso`);
  await page.click('text=定型 QSO を聞く');
  await page.locator('.field:has-text("見ながら聞く") .switch').click();
  await page.click('button:has-text("聞いてみる")');
  await page.waitForSelector('.transcript .line.current', { timeout: 20000 });
  check(true, '再生中の行がハイライトされる');
  await shot('10-qso-ragchew');
  await page.click('button:has-text("停止")');

  console.log('資料・記録・設定');
  for (const [path, text, name] of [
    ['#/ref?tab=codes', '英字', '11-ref-codes'],
    ['#/ref?tab=abbr', 'Q 符号', '12-ref-abbr'],
    ['#/ref?tab=qso', 'RST レポート', '13-ref-qso'],
    ['#/ref?tab=guide', 'Koch 法のしくみ', '14-ref-guide'],
    ['#/stats', '文字ごとの正答率', '15-stats'],
    ['#/settings', '受信環境', '16-settings'],
    ['#/practice', '瞬時認識ドリル', '17-practice'],
    ['#/free', '自由に再生', '18-free'],
  ]) {
    await page.goto(`${URL}${path}`);
    await page.waitForSelector(`text=${text}`);
    check(true, `${path} が表示される`);
    await shot(name);
  }
  await page.goto(`${URL}#/ref?tab=codes`);
  const startsBefore = await page.evaluate(() => window.__starts);
  await page.click('.code-cell:has-text("A")');
  await page.waitForFunction((k) => window.__starts > k, startsBefore);
  check(true, '符号表のタップで音が鳴る');

  console.log('受信環境 (ノイズ) 付きで再生しても例外が出ない');
  await page.goto(`${URL}#/settings`);
  await page.click('.segmented button:has-text("厳しい")');
  await page.click('text=この条件で試聴');
  await page.waitForTimeout(1500);

  console.log('オフライン動作 (Service Worker)');
  await page.goto(URL);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('text=Koch 法 講座', { timeout: 10000 });
  check(true, 'オフラインで再読み込みしても起動する');
  await context.setOffline(false);
} catch (e) {
  failures.push(String(e));
  console.error(e);
  await shot('zz-failure');
} finally {
  check(errors.length === 0, `コンソールエラーなし ${errors.length ? JSON.stringify(errors.slice(0, 5)) : ''}`);
  await browser.close();
  server.kill();
}

console.log(failures.length ? `\n${failures.length} 件失敗` : '\nすべて成功');
process.exit(failures.length ? 1 : 0);
