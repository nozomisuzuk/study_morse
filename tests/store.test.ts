import { describe, expect, it } from 'vitest';
import { DEFAULT_PROGRESS, DEFAULT_SETTINGS, mergeDefaults, settings, streakDays, today, updateSettings } from '../src/state/store';

describe('store', () => {
  it('fills missing fields and rejects wrong types', () => {
    const s = mergeDefaults(DEFAULT_SETTINGS, { charWpm: 25, toneHz: 'loud', conditions: { noise: 0.9 }, unknown: 1 });
    expect(s.charWpm).toBe(25);
    expect(s.toneHz).toBe(DEFAULT_SETTINGS.toneHz);
    expect(s.conditions).toEqual({ ...DEFAULT_SETTINGS.conditions, noise: 0.9 });
    expect((s as unknown as Record<string, unknown>).unknown).toBeUndefined();
  });
  it('keeps free-form dictionaries and arrays', () => {
    const p = mergeDefaults(DEFAULT_PROGRESS, {
      charStats: { K: { seen: 1, correct: 1, ema: 0.8, confusions: {} } },
      kochHistory: [{ date: 'x', lesson: 1, accuracy: 1, chars: 5, charWpm: 20, effWpm: 12 }],
      icrHistory: { not: 'an array' },
    });
    expect(p.charStats.K.seen).toBe(1);
    expect(p.kochHistory.length).toBe(1);
    expect(p.icrHistory).toEqual([]);
  });
  it('keeps effective speed at or below character speed', () => {
    updateSettings({ charWpm: 18, effWpm: 30 });
    expect(settings.value.effWpm).toBe(18);
    updateSettings({ charWpm: 99 });
    expect(settings.value.charWpm).toBe(50);
  });
  it('counts consecutive practice days', () => {
    const now = new Date(2026, 10, 20, 12);
    const d = (offset: number) => today(new Date(2026, 10, 20 - offset, 12));
    expect(streakDays({ [d(0)]: 60, [d(1)]: 60, [d(2)]: 60, [d(4)]: 60 }, now)).toBe(3);
    expect(streakDays({ [d(1)]: 60, [d(2)]: 60 }, now)).toBe(2);
    expect(streakDays({}, now)).toBe(0);
  });
});
