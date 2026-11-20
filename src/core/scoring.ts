/**
 * 送信されたトークン列 (ref) と、受信者が入力したトークン列 (hyp) を Levenshtein 距離で整列して採点する。
 */
export type AlignOp =
  | { type: 'match'; ref: string; hyp: string }
  | { type: 'sub'; ref: string; hyp: string }
  | { type: 'del'; ref: string } // 聞き逃し (入力されなかった)
  | { type: 'ins'; hyp: string }; // 余計な入力

export interface ScoreResult {
  ops: AlignOp[];
  /** 正しく取れた文字数 */
  correct: number;
  /** 送信された文字数 */
  total: number;
  /** 編集距離 (誤り数) */
  errors: number;
  /** 正答率 = max(0, total − errors) / total */
  accuracy: number;
}

export function align(ref: readonly string[], hyp: readonly string[]): AlignOp[] {
  const n = ref.length;
  const m = hyp.length;
  // dp[i][j] = ref[0..i) と hyp[0..j) の編集距離
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j - 1] + cost, dp[i - 1][j] + 1, dp[i][j - 1] + 1);
    }
  }
  // 逆にたどる。同点なら 一致/置換 → 脱落 → 挿入 の順に優先する
  const ops: AlignOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const same = ref[i - 1] === hyp[j - 1];
      if (dp[i][j] === dp[i - 1][j - 1] + (same ? 0 : 1)) {
        ops.push(same ? { type: 'match', ref: ref[i - 1], hyp: hyp[j - 1] } : { type: 'sub', ref: ref[i - 1], hyp: hyp[j - 1] });
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.push({ type: 'del', ref: ref[i - 1] });
      i--;
      continue;
    }
    ops.push({ type: 'ins', hyp: hyp[j - 1] });
    j--;
  }
  return ops.reverse();
}

export function score(ref: readonly string[], hyp: readonly string[]): ScoreResult {
  const ops = align(ref, hyp);
  let correct = 0;
  let errors = 0;
  for (const op of ops) {
    if (op.type === 'match') correct++;
    else errors++;
  }
  const total = ref.length;
  const accuracy = total === 0 ? (hyp.length === 0 ? 1 : 0) : Math.max(0, total - errors) / total;
  return { ops, correct, total, errors, accuracy };
}

/** 語間 (' ') を取り除く */
export function stripSpaces(tokens: readonly string[]): string[] {
  return tokens.filter((t) => t !== ' ');
}

/** 自由入力の答え合わせ用の正規化: 大文字化して空白を除く */
export function normalizeAnswer(s: string): string {
  return s.toUpperCase().replace(/\s+/g, '');
}

/** RST やナンバーのカットナンバー (N=9, T=0, A=1, E=5 など) を数字に戻す */
export function uncutNumber(s: string): string {
  const map: Record<string, string> = { T: '0', O: '0', A: '1', U: '2', V: '3', E: '5', B: '7', D: '8', N: '9' };
  return normalizeAnswer(s)
    .split('')
    .map((c) => map[c] ?? c)
    .join('');
}
