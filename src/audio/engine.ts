import { tokenize } from '../core/morse';
import { createRng, pick, randInt, type Rng } from '../core/rng';
import { render, renderBandNoise, type SignalLayer } from '../core/synth';
import { buildTimeline, type Timeline, type Timing } from '../core/timing';
import { callsign } from '../core/generators';

/** 音の設定 */
export interface ToneSettings {
  toneHz: number;
  /** 0..1 */
  volume: number;
  riseMs: number;
}

/** 受信環境 (それぞれ 0..1) */
export interface Conditions {
  noise: number;
  qsb: number;
  qrm: number;
  fist: number;
}

export const CLEAR: Conditions = { noise: 0, qsb: 0, qrm: 0, fist: 0 };

/** 1 回の送信 (ひと続きの文) */
export interface Transmission {
  /** モールスで送る文 ('<AR>' などの略符号表記を含んでよい) */
  text: string;
  timing: Timing;
  /** 音の高さを変える (局ごとの違いなど) */
  toneHz?: number;
  /** 手送りのゆらぎを個別に指定 */
  fist?: number;
  /** この送信のあとの無音 [秒] */
  gapAfter?: number;
}

export interface PlayOptions {
  tone: ToneSettings;
  conditions?: Conditions;
  seed?: number;
  /**
   * 各送信が鳴り始める時刻を通知する。perfStart は performance.now() 基準の予定時刻 [ms]。
   * (スケジュールした時点で呼ばれるので、実際に鳴るのは少し後)
   */
  onSchedule?: (index: number, perfStart: number, timeline: Timeline) => void;
}

const SIGNAL_AMP = 0.5;
/** ノイズレベル 1.0 のときのノイズ RMS (信号のピーク振幅 0.5 に対して) */
const NOISE_RMS_AT_FULL = 0.3;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class MorseAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sources = new Set<AudioScheduledSourceNode>();
  private session = 0;
  private playing = false;
  private noiseCache = new Map<string, AudioBuffer>();

  /** ユーザー操作 (タップ) の中で呼ぶ。自動再生の制限を解除する。 */
  unlock(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    // 無音を 1 サンプル鳴らしておく (一部のブラウザでの解除のため)
    const b = ctx.createBuffer(1, 1, ctx.sampleRate);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(ctx.destination);
    s.start();
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  /** 再生中の音をすべて止める */
  stop(): void {
    this.session++;
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* 既に止まっている */
      }
    }
    this.sources.clear();
    this.playing = false;
  }

  /** AudioContext の時刻を performance.now() の時刻 [ms] に変換する */
  private ctxToPerf(ctx: AudioContext, t: number): number {
    const latency = (ctx as AudioContext & { outputLatency?: number }).outputLatency || ctx.baseLatency || 0;
    return performance.now() + (t - ctx.currentTime + latency) * 1000;
  }

  private track(src: AudioScheduledSourceNode): void {
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  /**
   * 送信を順番に再生する。最後まで鳴り終わったら true、途中で stop() されたら false。
   * 長い交信でもメモリを食わないよう、少し先の分だけを合成してスケジュールする。
   */
  async play(items: readonly Transmission[], opts: PlayOptions): Promise<boolean> {
    const ctx = this.ensure();
    if (!ctx || !this.master) return false;
    this.stop();
    const session = ++this.session;
    this.playing = true;
    if (ctx.state !== 'running') {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }
    const sr = ctx.sampleRate;
    const rng = createRng(opts.seed);
    const cond = opts.conditions ?? CLEAR;
    const qsbSeed = Math.floor(rng.next() * 2 ** 31);
    this.master.gain.setValueAtTime(Math.max(0, Math.min(1, opts.tone.volume)), ctx.currentTime);

    let t = ctx.currentTime + 0.06;
    const t0 = t;
    let noise: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
    if (cond.noise > 0) noise = this.startNoise(ctx, t, opts.tone.toneHz, cond.noise, rng);

    try {
      for (let i = 0; i < items.length; i++) {
        if (session !== this.session) return false;
        const item = items[i];
        const freq = item.toneHz ?? opts.tone.toneHz;
        const timeline = buildTimeline(tokenize(item.text), item.timing, { fist: item.fist ?? cond.fist, rng });
        const layers: SignalLayer[] = [{ timeline, offset: 0, freq, amp: SIGNAL_AMP, fading: true }];
        if (cond.qrm > 0) layers.push(this.qrmLayer(rng, timeline.duration, freq, cond.qrm));
        const samples = render({
          sampleRate: sr,
          duration: timeline.duration,
          layers,
          riseMs: opts.tone.riseMs,
          qsb: cond.qsb > 0 ? { depth: cond.qsb, rng: createRng(qsbSeed), timeOffset: t - t0 } : undefined,
        });
        const buffer = ctx.createBuffer(1, samples.length, sr);
        buffer.getChannelData(0).set(samples);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(this.master);
        src.start(t);
        this.track(src);
        opts.onSchedule?.(i, this.ctxToPerf(ctx, t), timeline);
        t += timeline.duration + Math.max(0, item.gapAfter ?? 0);
        // 先読みは 1.5 秒分まで
        while (t - ctx.currentTime > 1.5) {
          await sleep(200);
          if (session !== this.session) return false;
        }
      }
      while (ctx.currentTime < t) {
        await sleep(Math.max(15, Math.min(120, (t - ctx.currentTime) * 1000)));
        if (session !== this.session) return false;
      }
      return true;
    } finally {
      if (noise) this.stopNoise(ctx, noise);
      if (session === this.session) this.playing = false;
    }
  }

  /** 1 文字や短い語を再生するだけの簡易版 */
  playText(text: string, timing: Timing, tone: ToneSettings, conditions?: Conditions): Promise<boolean> {
    return this.play([{ text, timing }], { tone, conditions });
  }

  private noiseBuffer(ctx: AudioContext, toneHz: number): AudioBuffer {
    const key = `${ctx.sampleRate}:${Math.round(toneHz / 10)}`;
    const cached = this.noiseCache.get(key);
    if (cached) return cached;
    const data = renderBandNoise(ctx.sampleRate, 6, toneHz, 550, createRng(12345));
    const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buf.getChannelData(0).set(data);
    this.noiseCache.set(key, buf);
    return buf;
  }

  private startNoise(ctx: AudioContext, t: number, toneHz: number, level: number, rng: Rng) {
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx, toneHz);
    src.loop = true;
    const gain = ctx.createGain();
    const target = NOISE_RMS_AT_FULL * Math.max(0, Math.min(1, level));
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(target, t);
    src.connect(gain);
    gain.connect(this.master!);
    // ループの継ぎ目が毎回同じ場所に来ないよう、開始位置をずらす
    src.start(ctx.currentTime, rng.next() * 5);
    this.track(src);
    return { src, gain };
  }

  private stopNoise(ctx: AudioContext, n: { src: AudioBufferSourceNode; gain: GainNode }): void {
    const now = ctx.currentTime;
    try {
      n.gain.gain.cancelScheduledValues(now);
      n.gain.gain.setValueAtTime(n.gain.gain.value, now);
      n.gain.gain.linearRampToValueAtTime(0, now + 0.15);
      n.src.stop(now + 0.2);
    } catch {
      /* already stopped */
    }
  }

  /** 混信: 近くの周波数で別の局が送信している */
  private qrmLayer(rng: Rng, duration: number, freq: number, level: number): SignalLayer {
    const call = callsign(rng, { kind: 'mixed' });
    const text = pick(rng, [`CQ CQ DE ${call} ${call} K`, `TEST ${call} ${call}`, `${call} 5NN TU`, `UR RST 579 579 = QTH`, `QRZ? DE ${call}`]);
    const wpm = randInt(rng, 16, 30);
    const timeline = buildTimeline(tokenize(text), { charWpm: wpm, effWpm: wpm });
    const offsetHz = (rng.next() < 0.5 ? -1 : 1) * randInt(rng, 140, 420);
    return {
      timeline,
      // 頭が切れたり途中から始まったりするよう、開始位置をランダムにずらす
      offset: rng.next() * duration * 0.5 - rng.next() * timeline.duration * 0.5,
      freq: Math.max(250, freq + offsetHz),
      amp: SIGNAL_AMP * Math.max(0, Math.min(1, level)) * (0.55 + rng.next() * 0.45),
    };
  }
}

export const audio = new MorseAudio();
