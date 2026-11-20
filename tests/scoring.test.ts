import { describe, expect, it } from 'vitest';
import { normalizeAnswer, score, stripSpaces, uncutNumber } from '../src/core/scoring';

const t = (s: string) => s.split('');

describe('score', () => {
  it('perfect copy', () => {
    const r = score(t('KMKMM'), t('KMKMM'));
    expect(r.accuracy).toBe(1);
    expect(r.correct).toBe(5);
  });
  it('substitution', () => {
    const r = score(t('ABC'), t('ABD'));
    expect(r.ops.map((o) => o.type)).toEqual(['match', 'match', 'sub']);
    expect(r.accuracy).toBeCloseTo(2 / 3);
  });
  it('missed character', () => {
    const r = score(t('ABCDE'), t('ABDE'));
    expect(r.ops.map((o) => o.type)).toEqual(['match', 'match', 'del', 'match', 'match']);
    expect(r.accuracy).toBeCloseTo(4 / 5);
  });
  it('extra character', () => {
    const r = score(t('ABC'), t('ABXC'));
    expect(r.ops.map((o) => o.type)).toEqual(['match', 'match', 'ins', 'match']);
    expect(r.accuracy).toBeCloseTo(2 / 3);
  });
  it('nothing typed', () => {
    const r = score(t('ABC'), []);
    expect(r.accuracy).toBe(0);
    expect(r.errors).toBe(3);
  });
  it('accuracy never negative', () => {
    expect(score(t('A'), t('XYZ')).accuracy).toBe(0);
  });
});

describe('answer normalization', () => {
  it('normalizes', () => {
    expect(normalizeAnswer(' ja1 abc ')).toBe('JA1ABC');
    expect(stripSpaces(['A', ' ', 'B'])).toEqual(['A', 'B']);
  });
  it('undoes cut numbers', () => {
    expect(uncutNumber('5NN')).toBe('599');
    expect(uncutNumber('TT7')).toBe('007');
    expect(uncutNumber('599')).toBe('599');
  });
});
