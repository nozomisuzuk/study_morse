import { describe, expect, it } from 'vitest';
import { tokenize } from '../src/core/morse';
import { createRng } from '../src/core/rng';
import { buildTimeline, spacing, textDuration, unitSeconds } from '../src/core/timing';

describe('timing', () => {
  it('uses the PARIS unit 1.2/wpm', () => {
    expect(unitSeconds(20)).toBeCloseTo(0.06, 10);
    const sp = spacing({ charWpm: 20, effWpm: 20 });
    expect(sp.charGap).toBeCloseTo(0.18, 10);
    expect(sp.wordGap).toBeCloseTo(0.42, 10);
  });

  it.each([
    [20, 20],
    [20, 12],
    [20, 6],
    [25, 15],
    [30, 18],
  ])('PARIS takes 60/eff seconds at char %i / eff %i wpm', (c, s) => {
    const words = 5;
    const tokens = tokenize(Array(words).fill('PARIS').join(' '));
    const sp = spacing({ charWpm: c, effWpm: s });
    // 最後の語のあとの語間を足すと、ちょうど words 語分の時間になる
    expect(textDuration(tokens, { charWpm: c, effWpm: s }) + sp.wordGap).toBeCloseTo((60 / s) * words, 6);
  });

  it('clamps effective speed to character speed', () => {
    expect(spacing({ charWpm: 15, effWpm: 30 })).toEqual(spacing({ charWpm: 15, effWpm: 15 }));
  });

  it('builds element and gap durations exactly without jitter', () => {
    const tl = buildTimeline(tokenize('K E'), { charWpm: 20, effWpm: 20 }, { lead: 0, tail: 0 });
    const u = 0.06;
    expect(tl.events.map((e) => +(e.end - e.start).toFixed(6))).toEqual([3 * u, u, 3 * u, u].map((x) => +x.toFixed(6)));
    // K の中の間隔は 1 単位
    expect(tl.events[1].start - tl.events[0].end).toBeCloseTo(u, 9);
    // K と E の間は語間 7 単位
    expect(tl.events[3].start - tl.events[2].end).toBeCloseTo(7 * u, 9);
    expect(tl.marks.map((m) => m.token)).toEqual(['K', 'E']);
  });

  it('hand-keying jitter is deterministic and keeps order', () => {
    const tokens = tokenize('CQ CQ DE JA1ABC K');
    const a = buildTimeline(tokens, { charWpm: 22, effWpm: 22 }, { fist: 1, rng: createRng(7) });
    const b = buildTimeline(tokens, { charWpm: 22, effWpm: 22 }, { fist: 1, rng: createRng(7) });
    expect(a).toEqual(b);
    for (let i = 0; i < a.events.length; i++) {
      expect(a.events[i].end).toBeGreaterThan(a.events[i].start);
      if (i > 0) expect(a.events[i].start).toBeGreaterThan(a.events[i - 1].end);
    }
    const plain = buildTimeline(tokens, { charWpm: 22, effWpm: 22 });
    expect(a.events.length).toBe(plain.events.length);
  });
});
