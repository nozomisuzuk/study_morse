import { describe, expect, it } from 'vitest';
import { checkAnswer, callsign, dxCallsign, generateQso, jaCallsign, randomGroup, wordsWithin, type QsoKind } from '../src/core/generators';
import { MORSE, tokenize } from '../src/core/morse';
import { createRng } from '../src/core/rng';
import { normalizeAnswer, uncutNumber } from '../src/core/scoring';
import { COMMON_WORDS, QSO_WORDS } from '../src/core/data/words';
import { ABBREVIATIONS } from '../src/core/data/abbreviations';

/** テキスト中のすべての文字がモールス符号に変換できる (捨てられる文字がない) */
function fullyEncodable(text: string): boolean {
  const stripped = text.toUpperCase().replace(/<[A-Z]+>/g, '').replace(/\s+/g, '');
  return [...stripped].every((c) => MORSE[c] !== undefined);
}

describe('random groups', () => {
  it('uses only the given characters and avoids triples', () => {
    const rng = createRng(42);
    const chars = ['K', 'M'];
    for (let i = 0; i < 300; i++) {
      const g = randomGroup(rng, chars, [1, 1], 5);
      expect(g.length).toBe(5);
      expect(g.every((c) => chars.includes(c))).toBe(true);
      expect(g.join('')).not.toMatch(/(.)\1\1/);
    }
  });
});

describe('words', () => {
  it('filters by learned characters', () => {
    expect(wordsWithin(['KM', 'MUK', 'CAT', 'K M'], ['K', 'M', 'U'])).toEqual(['KM', 'MUK', 'K M']);
  });
  it('all word lists are encodable', () => {
    for (const w of [...COMMON_WORDS, ...QSO_WORDS]) expect(fullyEncodable(w), w).toBe(true);
    for (const a of ABBREVIATIONS) expect(tokenize(a.code).length, a.label).toBeGreaterThan(0);
  });
});

describe('callsigns', () => {
  it('JA callsigns look right', () => {
    const rng = createRng(1);
    for (let i = 0; i < 500; i++) expect(jaCallsign(rng).call).toMatch(/^(J[AE-S]|7[K-N])\d[A-Z]{2,3}$/);
  });
  it('DX and portable callsigns are encodable', () => {
    const rng = createRng(2);
    for (let i = 0; i < 500; i++) {
      expect(dxCallsign(rng).call).toMatch(/^[A-Z0-9]{2,4}\d?[A-Z]{1,3}$/);
      expect(fullyEncodable(callsign(rng, { kind: 'mixed', portable: true }))).toBe(true);
    }
  });
});

describe('QSO generator', () => {
  const kinds: QsoKind[] = ['cq', 'reply', 'ragchew', 'contest', 'dx'];
  it.each(kinds)('%s: lines are encodable and answers are audible', (kind) => {
    for (let seed = 0; seed < 200; seed++) {
      const qso = generateQso(kind, createRng(seed), { hour: seed % 24, myCall: seed % 2 ? 'JA1ZZZ' : '' });
      expect(qso.lines.length).toBeGreaterThan(0);
      expect(qso.questions.length).toBeGreaterThan(0);
      const audible = qso.lines.filter((l) => !l.silent).map((l) => l.text).join(' ');
      for (const line of qso.lines) {
        expect(fullyEncodable(line.text), line.text).toBe(true);
        expect(line.ja.length).toBeGreaterThan(0);
      }
      for (const q of qso.questions) {
        // 正解 (または送信された表記) が実際に再生される文の中にある
        const heard = q.accept.some((a) => audible.includes(a));
        expect(heard, `${kind} ${q.id} ${q.answer} in ${audible}`).toBe(true);
        expect(checkAnswer(q, q.answer, normalizeAnswer, uncutNumber)).toBe(true);
        expect(checkAnswer(q, '', normalizeAnswer, uncutNumber)).toBe(false);
      }
    }
  });

  it('uses my callsign in reply scenario', () => {
    const qso = generateQso('reply', createRng(9), { myCall: 'jj1xyz' });
    expect(qso.stations.A.call).toBe('JJ1XYZ');
    expect(qso.lines[1].text.startsWith('JJ1XYZ DE ')).toBe(true);
  });

  it('accepts cut numbers for numeric answers', () => {
    const q = { id: 'r', label: '', answer: '599', accept: ['599'], numeric: true };
    expect(checkAnswer(q, '5nn', normalizeAnswer, uncutNumber)).toBe(true);
    expect(checkAnswer(q, '579', normalizeAnswer, uncutNumber)).toBe(false);
  });
});
