/** 画面の消灯防止 (Screen Wake Lock API) と読み上げ (Web Speech API) */

let sentinel: WakeLockSentinel | null = null;
let wanted = false;

async function acquire(): Promise<void> {
  try {
    if (!('wakeLock' in navigator) || sentinel) return;
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    /* 省電力モードなどで拒否されることがある */
  }
}

export function setKeepAwake(on: boolean): void {
  wanted = on;
  if (on) void acquire();
  else if (sentinel) {
    void sentinel.release().catch(() => undefined);
    sentinel = null;
  }
}

if (typeof document !== 'undefined') {
  // 画面を切り替えると解除されるので、戻ってきたら取り直す
  document.addEventListener('visibilitychange', () => {
    if (wanted && document.visibilityState === 'visible') void acquire();
  });
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * 答えを読み上げる。略語やコールサインは 1 文字ずつ区切って読ませる。
 * 戻り値の Promise は読み上げが終わったら (または失敗したら) 解決する。
 */
export function speak(text: string, spell: boolean): Promise<void> {
  return new Promise((resolve) => {
    if (!canSpeak()) return resolve();
    const content = spell ? text.split('').filter((c) => c.trim()).join(' ') : text;
    const u = new SpeechSynthesisUtterance(content.replace(/\//g, ' stroke '));
    u.lang = 'en-US';
    u.rate = 1.0;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    // 読み上げエンジンが反応しない端末向けの保険
    setTimeout(resolve, 4000);
  });
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}
