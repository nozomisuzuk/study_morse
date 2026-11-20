import { useEffect, useRef } from 'preact/hooks';
import { audio, type ToneSettings } from '../audio/engine';
import { setKeepAwake, stopSpeaking } from '../audio/device';
import type { Timing } from '../core/timing';
import { logPractice, settings, type Settings } from '../state/store';

export function toneOf(s: Settings = settings.value): ToneSettings {
  return { toneHz: s.toneHz, volume: s.volume, riseMs: s.riseMs };
}

export function timingOf(s: Settings = settings.value): Timing {
  return { charWpm: s.charWpm, effWpm: s.effWpm };
}

/** 物理キーボードからの入力 (タブレットや PC で使う場合) */
export function useKeyboard(handler: (key: string, e: KeyboardEvent) => void, enabled = true): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      ref.current(e.key, e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

/** 物理キーをトークンに変換する。対応しないキーは null。 */
export function keyToToken(key: string): string | null {
  const k = key.length === 1 ? key.toUpperCase() : key;
  if (/^[A-Z0-9]$/.test(k)) return k;
  if (['.', ',', '?', '/', '=', '+', '('].includes(k)) return k;
  if (k === '*') return '<SK>';
  return null;
}

/** 練習中は画面を消さない。画面を離れたら音を止める。 */
export function useSessionGuards(active: boolean): void {
  useEffect(() => {
    if (active && settings.value.keepAwake) setKeepAwake(true);
    return () => setKeepAwake(false);
  }, [active]);
  useEffect(
    () => () => {
      audio.stop();
      stopSpeaking();
    },
    [],
  );
}

/** 練習時間を記録する。active が true の間を計測し、false になるか画面を離れたときに保存する。 */
export function usePracticeTimer(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    return () => logPractice((Date.now() - start) / 1000);
  }, [active]);
}
