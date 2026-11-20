/**
 * Koch 法 (L. Koch, 1936): 最初から実用速度の文字速度で 2 文字だけを練習し、
 * 正答率 90% を超えたら 1 文字ずつ増やしていく。
 *
 * 文字の導入順は LCWO (Learn CW Online) で使われている順序に従い、
 * 交信で必須の略符号 AR / SK / KN を最後に追加している。
 */
export const KOCH_ORDER: readonly string[] = [
  'K', 'M', 'U', 'R', 'E', 'S', 'N', 'A', 'P', 'T',
  'L', 'W', 'I', '.', 'J', 'Z', '=', 'F', 'O', 'Y',
  ',', 'V', 'G', '5', '/', 'Q', '9', '2', 'H', '3',
  '8', 'B', '?', '4', '7', 'C', '1', 'D', '6', '0',
  'X', '+', '<SK>', '(',
];

/** レッスン番号は 1 始まり。レッスン n では先頭から n+1 文字を使う。 */
export const MAX_LESSON = KOCH_ORDER.length - 1;

export function clampLesson(lesson: number): number {
  return Math.max(1, Math.min(MAX_LESSON, Math.floor(lesson)));
}

export function lessonChars(lesson: number): string[] {
  return KOCH_ORDER.slice(0, clampLesson(lesson) + 1);
}

/** そのレッスンで新しく加わる文字 */
export function newCharsOf(lesson: number): string[] {
  const l = clampLesson(lesson);
  return l === 1 ? [KOCH_ORDER[0], KOCH_ORDER[1]] : [KOCH_ORDER[l]];
}

/** 合格ライン */
export const PASS_ACCURACY = 0.9;
