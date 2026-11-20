/** シード付き乱数 (mulberry32)。テストで再現できるようにするため Math.random を直接使わない。 */
export interface Rng {
  /** [0, 1) の一様乱数 */
  next(): number;
}

export function createRng(seed: number = Date.now() ^ (Math.random() * 0x7fffffff)): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export function randInt(rng: Rng, min: number, maxInclusive: number): number {
  return min + Math.floor(rng.next() * (maxInclusive - min + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick from empty array');
  return items[Math.floor(rng.next() * items.length)];
}

/** 重み付き抽選。重みが全部 0 以下なら一様に選ぶ。 */
export function pickWeighted<T>(rng: Rng, items: readonly T[], weights: readonly number[]): T {
  if (items.length === 0) throw new Error('pickWeighted from empty array');
  let total = 0;
  for (const w of weights) total += Math.max(0, w);
  if (total <= 0) return pick(rng, items);
  let r = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    r -= Math.max(0, weights[i] ?? 0);
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

/** 標準正規分布 (Box–Muller) */
export function gaussian(rng: Rng): number {
  let u = 0;
  while (u === 0) u = rng.next();
  const v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
