import { describe, expect, it } from 'vitest';
import { charWeights, recordAlignment, recordChar, topConfusions } from '../src/core/stats';
import { score } from '../src/core/scoring';

describe('stats', () => {
  it('records correct and wrong answers', () => {
    let s = recordChar({}, 'K', 'K', 400);
    s = recordChar(s, 'K', 'R');
    expect(s.K.seen).toBe(2);
    expect(s.K.correct).toBe(1);
    expect(s.K.confusions).toEqual({ R: 1 });
    expect(s.K.rtEma).toBe(400);
  });
  it('records an alignment', () => {
    const r = score(['K', 'M', 'U'], ['K', 'U']);
    const s = recordAlignment({}, r.ops);
    expect(s.K.correct).toBe(1);
    expect(s.M.correct).toBe(0);
    expect(s.U.correct).toBe(1);
  });
  it('weights weak and new characters higher', () => {
    let s = {};
    for (let i = 0; i < 20; i++) s = recordChar(s, 'K', 'K');
    for (let i = 0; i < 20; i++) s = recordChar(s, 'M', i % 2 ? 'M' : 'K');
    const [wk, wm] = charWeights(['K', 'M'], s);
    expect(wm).toBeGreaterThan(wk);
    const [wk2, wu] = charWeights(['K', 'U'], s, ['U']);
    expect(wu).toBeGreaterThan(wk2);
    expect(topConfusions(s)[0]).toEqual({ ref: 'M', hyp: 'K', count: 10 });
  });
});
