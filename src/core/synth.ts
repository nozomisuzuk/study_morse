import type { Timeline } from './timing';
import { gaussian, type Rng } from './rng';

/**
 * タイムラインから PCM サンプルを合成する (Web Audio に依存しない純粋関数なのでテストできる)。
 *
 * キーイングの立ち上がり/立ち下がりは raised-cosine で整形してクリック音を防ぐ。
 * 立ち上がりは要素の開始時刻から、立ち下がりは終了時刻から始める
 * (半値点の間隔が元の長さと等しくなる)。
 */
export interface SignalLayer {
  timeline: Timeline;
  /** バッファ先頭からの開始時刻 [秒] (負なら頭が切れる) */
  offset: number;
  freq: number;
  /** ピーク振幅 (0..1) */
  amp: number;
  /** QSB (フェージング) をかけるか */
  fading?: boolean;
}

export interface QsbSpec {
  /** 深さ 0..1 (1 で完全に消える瞬間がある) */
  depth: number;
  /** 位相・周期を決める乱数 */
  rng: Rng;
  /** 連続する複数バッファでフェージングをつなげるための絶対時刻オフセット [秒] */
  timeOffset?: number;
}

export interface RenderSpec {
  sampleRate: number;
  duration: number;
  layers: SignalLayer[];
  riseMs: number;
  qsb?: QsbSpec;
}

export function render(spec: RenderSpec): Float32Array {
  const { sampleRate: sr } = spec;
  const n = Math.max(1, Math.ceil(spec.duration * sr));
  const out = new Float32Array(n);
  const fade = spec.qsb && spec.qsb.depth > 0 ? makeQsb(spec.qsb) : null;

  for (const layer of spec.layers) {
    const w = (2 * Math.PI * layer.freq) / sr;
    const minEvent = layer.timeline.events.reduce((m, e) => Math.min(m, e.end - e.start), Infinity);
    // 立ち上がり時間は最短要素の半分を超えないようにする (隣の要素と重ならないため)
    const rise = Math.max(0.0005, Math.min(spec.riseMs / 1000, Number.isFinite(minEvent) ? minEvent / 2 : 1));
    const riseN = rise * sr;
    for (const ev of layer.timeline.events) {
      const a = (ev.start + layer.offset) * sr; // 立ち上がり開始 (サンプル位置, 小数)
      const b = (ev.end + layer.offset) * sr; // 立ち下がり開始
      const s0 = Math.max(0, Math.floor(a));
      const s1 = Math.min(n, Math.ceil(b + riseN));
      for (let s = s0; s < s1; s++) {
        let up: number;
        if (s < a) up = 0;
        else if (s < a + riseN) up = 0.5 - 0.5 * Math.cos((Math.PI * (s - a)) / riseN);
        else up = 1;
        let down: number;
        if (s < b) down = 1;
        else if (s < b + riseN) down = 0.5 + 0.5 * Math.cos((Math.PI * (s - b)) / riseN);
        else down = 0;
        const env = up < down ? up : down;
        if (env <= 0) continue;
        let g = layer.amp * env;
        if (fade && layer.fading) g *= fade(s / sr);
        out[s] += g * Math.sin(w * s);
      }
    }
  }

  // 複数の信号が重なって 1 を超えたら全体を縮める
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.abs(out[i]);
    if (v > peak) peak = v;
  }
  if (peak > 0.98) {
    const k = 0.98 / peak;
    for (let i = 0; i < n; i++) out[i] *= k;
  }
  return out;
}

/** フェージングの利得関数 g(t) ∈ [1 − depth, 1] を作る。2 つの遅い正弦波の和で不規則さを出す。 */
export function makeQsb(q: QsbSpec): (t: number) => number {
  const depth = Math.max(0, Math.min(1, q.depth));
  const f1 = 0.06 + q.rng.next() * 0.12; // 周期 5〜17 秒
  const f2 = 0.17 + q.rng.next() * 0.25; // 周期 2.4〜6 秒
  const p1 = q.rng.next() * 2 * Math.PI;
  const p2 = q.rng.next() * 2 * Math.PI;
  const off = q.timeOffset ?? 0;
  return (t: number) => {
    const x = t + off;
    const v = 0.65 * Math.sin(2 * Math.PI * f1 * x + p1) + 0.35 * Math.sin(2 * Math.PI * f2 * x + p2); // [-1, 1]
    const fall = (v + 1) / 2; // [0, 1]
    return 1 - depth * fall * fall; // 深く落ちる時間は短め
  };
}

/**
 * 受信機の CW フィルタを通したようなバンドノイズ (ループ再生用)。
 * 白色雑音に中心 centerHz・帯域 bandwidthHz のバンドパス (2 段) をかけ、少しだけ広帯域成分を混ぜる。
 * 末尾と先頭をクロスフェードして継ぎ目なくループできるようにする。RMS ≈ 1 に正規化。
 */
export function renderBandNoise(
  sampleRate: number,
  seconds: number,
  centerHz: number,
  bandwidthHz: number,
  rng: Rng,
): Float32Array {
  const n = Math.max(1, Math.floor(seconds * sampleRate));
  const xfade = Math.min(Math.floor(0.08 * sampleRate), Math.floor(n / 4));
  const total = n + xfade;
  const raw = new Float32Array(total);

  const bp1 = biquadBandpass(sampleRate, centerHz, centerHz / bandwidthHz);
  const bp2 = biquadBandpass(sampleRate, centerHz, centerHz / bandwidthHz);
  // 1 次ローパス (広帯域の「サー」という成分)
  const lpA = Math.exp((-2 * Math.PI * 2500) / sampleRate);
  let lp = 0;
  for (let i = 0; i < total; i++) {
    const w = gaussian(rng);
    const narrow = bp2(bp1(w));
    lp = (1 - lpA) * w + lpA * lp;
    raw[i] = narrow + 0.12 * lp;
  }
  // ループの継ぎ目: 末尾 xfade サンプルを先頭へ等パワーでクロスフェード
  const out = raw.slice(0, n);
  for (let i = 0; i < xfade; i++) {
    const x = i / xfade;
    const gin = Math.sin((Math.PI / 2) * x);
    const gout = Math.cos((Math.PI / 2) * x);
    out[i] = raw[i] * gin + raw[n + i] * gout;
  }
  let sum = 0;
  for (let i = 0; i < n; i++) sum += out[i] * out[i];
  const rms = Math.sqrt(sum / n) || 1;
  for (let i = 0; i < n; i++) out[i] /= rms;
  return out;
}

/** RBJ cookbook のバンドパス (ピーク利得 0 dB) */
function biquadBandpass(sr: number, f0: number, q: number): (x: number) => number {
  const w0 = (2 * Math.PI * f0) / sr;
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const b2 = -alpha / a0;
  const a1 = (-2 * Math.cos(w0)) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (x: number) => {
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}
