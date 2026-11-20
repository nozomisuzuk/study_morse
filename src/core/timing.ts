import { MORSE } from './morse';
import { gaussian, type Rng } from './rng';

/**
 * 速度の指定。
 *  - charWpm: 文字速度。1 文字の中の短点・長点の速さ。
 *  - effWpm : 実効速度。文字間・語間を広げた全体の速さ (Farnsworth 方式)。charWpm 以下。
 *
 * PARIS 方式: "PARIS " が 50 単位 (符号部分 31 単位 + 文字間 3×4 + 語間 7 = 19 単位)。
 * 1 単位 = 60 / (50 × WPM) = 1.2 / WPM 秒。
 *
 * Farnsworth: 符号部分 (31 単位) は文字速度のまま、残りの 19 単位分を引き伸ばして
 * 1 語 (PARIS) が 60 / effWpm 秒になるようにする。
 *   fu = (60 / effWpm − 31 × 1.2 / charWpm) / 19   (Farnsworth 単位)
 *   文字間 = 3 fu,  語間 = 7 fu
 * (ARRL の Farnsworth 規格 [J. Bloom, KE3Z] と同じ結果になる式)
 */
export interface Timing {
  charWpm: number;
  effWpm: number;
}

export interface Spacing {
  /** 1 単位 (短点の長さ) [秒] */
  unit: number;
  /** 文字間の無音 [秒] */
  charGap: number;
  /** 語間の無音 [秒] */
  wordGap: number;
}

export function unitSeconds(wpm: number): number {
  return 1.2 / wpm;
}

export function spacing(t: Timing): Spacing {
  const unit = unitSeconds(t.charWpm);
  const eff = Math.min(t.effWpm, t.charWpm);
  if (eff >= t.charWpm) return { unit, charGap: 3 * unit, wordGap: 7 * unit };
  const fu = (60 / eff - 31 * unit) / 19;
  return { unit, charGap: 3 * fu, wordGap: 7 * fu };
}

/** キーダウン区間 [秒] */
export interface KeyEvent {
  start: number;
  end: number;
}

/** 各トークンが鳴っている区間 (表示や反応時間の計測に使う) */
export interface TokenMark {
  token: string;
  start: number;
  end: number;
}

export interface Timeline {
  events: KeyEvent[];
  marks: TokenMark[];
  /** 先頭の無音から末尾の余白までを含めた長さ [秒] */
  duration: number;
}

export interface TimelineOptions {
  /** 手送りのゆらぎ (0 = 機械送信, 1 = かなり癖のある手送り) */
  fist?: number;
  rng?: Rng;
  /** 先頭の無音 [秒] */
  lead?: number;
  /** 末尾の無音 [秒] */
  tail?: number;
}

/**
 * トークン列からキーイングのタイムラインを作る。
 * 文字間は前の文字の最後の要素の終わりから次の文字の最初の要素の始まりまで。
 */
export function buildTimeline(tokens: readonly string[], timing: Timing, opts: TimelineOptions = {}): Timeline {
  const sp = spacing(timing);
  const fist = Math.max(0, Math.min(1, opts.fist ?? 0));
  const rng = opts.rng;
  const lead = opts.lead ?? 0.05;
  const tail = opts.tail ?? 0.1;

  // 手送りの癖: 局ごとに長点/短点比と間隔の詰まり具合が違う
  const jitterOn = fist > 0 && rng !== undefined;
  const dahRatio = jitterOn ? 3 + (rng.next() * 0.9 - 0.4) * fist : 3;
  const gapBias = jitterOn ? 1 + (rng.next() * 0.5 - 0.2) * fist : 1;
  const jit = (base: number, sigma: number): number => {
    if (!jitterOn) return base;
    const f = 1 + gaussian(rng) * sigma * fist;
    return base * Math.max(0.55, Math.min(1.8, f));
  };

  const events: KeyEvent[] = [];
  const marks: TokenMark[] = [];
  let t = lead;
  let hasChar = false;
  let pendingWord = false;

  for (const tok of tokens) {
    if (tok === ' ') {
      if (hasChar) pendingWord = true;
      continue;
    }
    const code = MORSE[tok];
    if (code === undefined) continue;
    if (hasChar) {
      t += pendingWord ? jit(sp.wordGap * gapBias, 0.2) : jit(sp.charGap * gapBias, 0.18);
    }
    pendingWord = false;
    const charStart = t;
    for (let k = 0; k < code.length; k++) {
      if (k > 0) t += jit(sp.unit, 0.15);
      const len = code[k] === '.' ? jit(sp.unit, 0.12) : jit(sp.unit * dahRatio, 0.1);
      events.push({ start: t, end: t + len });
      t += len;
    }
    marks.push({ token: tok, start: charStart, end: t });
    hasChar = true;
  }

  return { events, marks, duration: t + tail };
}

/** トークン列を送るのにかかる秒数 (余白なし、機械送信) */
export function textDuration(tokens: readonly string[], timing: Timing): number {
  const tl = buildTimeline(tokens, timing, { lead: 0, tail: 0 });
  return tl.duration;
}
