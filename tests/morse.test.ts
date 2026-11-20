import { describe, expect, it } from 'vitest';
import { MORSE, codeUnits, displayText, tokenize, tokenLabel } from '../src/core/morse';
import { KOCH_ORDER, MAX_LESSON, lessonChars, newCharsOf } from '../src/core/koch';

describe('morse table', () => {
  it('has unique codes', () => {
    const codes = Object.values(MORSE);
    expect(new Set(codes).size).toBe(codes.length);
  });
  it('covers every Koch character', () => {
    for (const c of KOCH_ORDER) expect(MORSE[c], c).toBeDefined();
  });
  it('matches well-known codes', () => {
    expect(MORSE.A).toBe('.-');
    expect(MORSE.Q).toBe('--.-');
    expect(MORSE['0']).toBe('-----');
    expect(MORSE['/']).toBe('-..-.');
    expect(MORSE['?']).toBe('..--..');
    expect(MORSE['+']).toBe('.-.-.'); // AR
    expect(MORSE['=']).toBe('-...-'); // BT
    expect(MORSE['(']).toBe('-.--.'); // KN
    expect(MORSE['<SK>']).toBe('...-.-');
  });
  it('PARIS is 31 element units', () => {
    expect([...'PARIS'].reduce((s, c) => s + codeUnits(MORSE[c]), 0)).toBe(31);
  });
});

describe('tokenize', () => {
  it('splits words and prosigns', () => {
    expect(tokenize('cq de ja1abc <ar> k')).toEqual(['C', 'Q', ' ', 'D', 'E', ' ', 'J', 'A', '1', 'A', 'B', 'C', ' ', '+', ' ', 'K']);
  });
  it('maps aliases and drops unknown characters', () => {
    expect(tokenize('<BT><VA><SK>')).toEqual(['=', '<SK>', '<SK>']);
    expect(tokenize('  A   b#  ')).toEqual(['A', ' ', 'B']);
    expect(tokenize('<XYZ>A')).toEqual(['X', 'Y', 'Z', 'A']);
  });
  it('labels prosigns for display', () => {
    expect(tokenLabel('+')).toBe('AR');
    expect(displayText(tokenize('73 <SK> E E'))).toBe('73 SK E E');
    expect(displayText(tokenize('HW?<AR>'))).toBe('HW? AR');
  });
});

describe('koch', () => {
  it('has 44 unique characters and 43 lessons', () => {
    expect(KOCH_ORDER.length).toBe(44);
    expect(new Set(KOCH_ORDER).size).toBe(44);
    expect(MAX_LESSON).toBe(43);
  });
  it('starts with K M and adds one per lesson', () => {
    expect(lessonChars(1)).toEqual(['K', 'M']);
    expect(newCharsOf(1)).toEqual(['K', 'M']);
    expect(lessonChars(2)).toEqual(['K', 'M', 'U']);
    expect(newCharsOf(2)).toEqual(['U']);
    expect(lessonChars(99).length).toBe(44);
  });
});
