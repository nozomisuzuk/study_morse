import { describe, expect, it } from 'vitest';
import { tokenize } from '../src/core/morse';
import { createRng } from '../src/core/rng';
import { makeQsb, render, renderBandNoise } from '../src/core/synth';
import { buildTimeline } from '../src/core/timing';

const SR = 8000;

describe('render', () => {
  it('produces a click-free tone exactly where the key is down', () => {
    const tl = buildTimeline(tokenize('E'), { charWpm: 20, effWpm: 20 }, { lead: 0.1, tail: 0.1 });
    const out = render({ sampleRate: SR, duration: tl.duration, layers: [{ timeline: tl, offset: 0, freq: 600, amp: 0.5 }], riseMs: 5 });
    expect(out.length).toBe(Math.ceil(tl.duration * SR));
    const start = Math.floor(0.1 * SR);
    const end = Math.ceil((0.1 + 0.06 + 0.005) * SR);
    for (let i = 0; i < start; i++) expect(out[i]).toBe(0);
    for (let i = end + 1; i < out.length; i++) expect(out[i]).toBe(0);
    const peak = Math.max(...Array.from(out, Math.abs));
    expect(peak).toBeGreaterThan(0.45);
    expect(peak).toBeLessThanOrEqual(0.5);
    // 立ち上がり直後は小さい (いきなり最大振幅にならない)
    expect(Math.abs(out[start + 1])).toBeLessThan(0.05);
    expect(Array.from(out).every(Number.isFinite)).toBe(true);
  });

  it('keeps the mix below full scale', () => {
    const tl = buildTimeline(tokenize('TTT'), { charWpm: 20, effWpm: 20 });
    const layer = { timeline: tl, offset: 0, freq: 600, amp: 0.9 };
    const out = render({ sampleRate: SR, duration: tl.duration, layers: [layer, { ...layer, freq: 700 }], riseMs: 5 });
    expect(Math.max(...Array.from(out, Math.abs))).toBeLessThanOrEqual(0.981);
  });

  it('applies fading only to fading layers', () => {
    const tl = buildTimeline(tokenize('T'), { charWpm: 5, effWpm: 5 }, { lead: 0, tail: 0 });
    const spec = { sampleRate: SR, duration: tl.duration, riseMs: 5, qsb: { depth: 1, rng: createRng(3) } };
    const faded = render({ ...spec, layers: [{ timeline: tl, offset: 0, freq: 600, amp: 0.5, fading: true }] });
    const plain = render({ ...spec, layers: [{ timeline: tl, offset: 0, freq: 600, amp: 0.5 }] });
    const energy = (a: Float32Array) => a.reduce((s, x) => s + x * x, 0);
    expect(energy(faded)).toBeLessThan(energy(plain));
  });
});

describe('qsb', () => {
  it('stays between 1-depth and 1', () => {
    const g = makeQsb({ depth: 0.7, rng: createRng(1) });
    for (let t = 0; t < 60; t += 0.05) {
      const v = g(t);
      expect(v).toBeGreaterThanOrEqual(0.3 - 1e-9);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe('band noise', () => {
  it('is normalized and loops without a jump', () => {
    const n = renderBandNoise(SR, 2, 600, 500, createRng(5));
    const rms = Math.sqrt(n.reduce((s, x) => s + x * x, 0) / n.length);
    expect(rms).toBeCloseTo(1, 5);
    let meanStep = 0;
    for (let i = 1; i < n.length; i++) meanStep += Math.abs(n[i] - n[i - 1]);
    meanStep /= n.length - 1;
    expect(Math.abs(n[0] - n[n.length - 1])).toBeLessThan(meanStep * 6);
  });
});
