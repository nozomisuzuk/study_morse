import type { AlignOp } from './scoring';

/** 文字ごとの成績 */
export interface CharStat {
  seen: number;
  correct: number;
  /** 最近の正答率 (指数移動平均, 0..1) */
  ema: number;
  /** 最近の反応時間 [ms] (指数移動平均, 瞬時認識ドリルのみ) */
  rtEma?: number;
  /** 聞き間違えた相手と回数 */
  confusions: Record<string, number>;
}

export type CharStats = Record<string, CharStat>;

const EMA_ALPHA = 0.15;
const RT_ALPHA = 0.25;

function blank(): CharStat {
  return { seen: 0, correct: 0, ema: 0.75, confusions: {} };
}

/** 1 文字分の結果を反映した新しい統計を返す (元のオブジェクトは変更しない) */
export function recordChar(stats: CharStats, ref: string, hyp: string | null, rtMs?: number): CharStats {
  const prev = stats[ref] ?? blank();
  const ok = hyp === ref;
  const next: CharStat = {
    seen: prev.seen + 1,
    correct: prev.correct + (ok ? 1 : 0),
    ema: prev.ema + EMA_ALPHA * ((ok ? 1 : 0) - prev.ema),
    rtEma: prev.rtEma,
    confusions: prev.confusions,
  };
  if (!ok && hyp) next.confusions = { ...prev.confusions, [hyp]: (prev.confusions[hyp] ?? 0) + 1 };
  if (ok && rtMs !== undefined && Number.isFinite(rtMs)) {
    const rt = Math.max(0, Math.min(5000, rtMs));
    next.rtEma = prev.rtEma === undefined ? rt : prev.rtEma + RT_ALPHA * (rt - prev.rtEma);
  }
  return { ...stats, [ref]: next };
}

/** 採点結果 (整列) を文字ごとの統計に反映する */
export function recordAlignment(stats: CharStats, ops: readonly AlignOp[]): CharStats {
  let s = stats;
  for (const op of ops) {
    if (op.type === 'match') s = recordChar(s, op.ref, op.hyp);
    else if (op.type === 'sub') s = recordChar(s, op.ref, op.hyp);
    else if (op.type === 'del') s = recordChar(s, op.ref, null);
  }
  return s;
}

/**
 * 出題の重み。最近よく間違える文字・反応が遅い文字ほど多く出す。
 * 新しく加わった文字は 2 倍。
 */
export function charWeights(
  chars: readonly string[],
  stats: CharStats,
  newChars: readonly string[] = [],
  useReaction = false,
): number[] {
  const rts = chars.map((c) => stats[c]?.rtEma).filter((x): x is number => x !== undefined);
  const meanRt = rts.length > 0 ? rts.reduce((a, b) => a + b, 0) / rts.length : 0;
  return chars.map((c) => {
    const s = stats[c];
    let w = 1;
    if (s) {
      w += 3 * (1 - s.ema);
      if (s.seen < 10) w += 0.5; // まだあまり出ていない文字
      if (useReaction && s.rtEma !== undefined && meanRt > 0) w *= Math.min(2, Math.max(0.6, s.rtEma / meanRt));
    } else {
      w += 1;
    }
    if (newChars.includes(c)) w *= 2;
    return w;
  });
}

/** よく聞き間違える組み合わせ (多い順) */
export function topConfusions(stats: CharStats, limit = 8): { ref: string; hyp: string; count: number }[] {
  const list: { ref: string; hyp: string; count: number }[] = [];
  for (const [ref, s] of Object.entries(stats)) {
    for (const [hyp, count] of Object.entries(s.confusions)) list.push({ ref, hyp, count });
  }
  return list.sort((a, b) => b.count - a.count).slice(0, limit);
}
