import { effect, signal } from '@preact/signals';
import type { Conditions } from '../audio/engine';
import { clampLesson } from '../core/koch';
import type { CharStats } from '../core/stats';

export type ConditionsPreset = 'clear' | 'normal' | 'hard' | 'custom';
export type PracticeMode = 'koch' | 'icr' | 'words' | 'calls' | 'qso';

export interface Settings {
  /** 文字速度 [WPM] */
  charWpm: number;
  /** 実効速度 [WPM] (Farnsworth) */
  effWpm: number;
  toneHz: number;
  volume: number;
  riseMs: number;
  /** Koch: 1 グループの文字数 */
  groupLen: number;
  /** Koch: 1 回の練習のグループ数 */
  groupsPerSession: number;
  /** Koch: 1 グループずつ答える / まとめて聞く */
  kochMode: 'group' | 'stream';
  /** 答え合わせのあと自動で次へ進む */
  autoAdvance: boolean;
  /** 符号 (・－) を表示する */
  showCodes: boolean;
  conditionsPreset: ConditionsPreset;
  conditions: Conditions;
  /** 練習モードごとに受信環境 (ノイズなど) を使うか */
  conditionsOn: Record<PracticeMode, boolean>;
  /** 瞬時認識ドリルの出題数 */
  icrCount: number;
  myCall: string;
  keepAwake: boolean;
  theme: 'system' | 'dark' | 'light';
}

export const PRESETS: Record<Exclude<ConditionsPreset, 'custom'>, Conditions> = {
  clear: { noise: 0, qsb: 0, qrm: 0, fist: 0 },
  normal: { noise: 0.35, qsb: 0.35, qrm: 0, fist: 0.3 },
  hard: { noise: 0.7, qsb: 0.65, qrm: 0.5, fist: 0.6 },
};

export const DEFAULT_SETTINGS: Settings = {
  charWpm: 20,
  effWpm: 12,
  toneHz: 600,
  volume: 0.7,
  riseMs: 5,
  groupLen: 5,
  groupsPerSession: 20,
  kochMode: 'group',
  autoAdvance: true,
  showCodes: false,
  conditionsPreset: 'normal',
  conditions: PRESETS.normal,
  conditionsOn: { koch: false, icr: false, words: false, calls: false, qso: true },
  icrCount: 30,
  myCall: '',
  keepAwake: true,
  theme: 'system',
};

export interface KochRecord {
  date: string;
  lesson: number;
  accuracy: number;
  chars: number;
  charWpm: number;
  effWpm: number;
}

export interface Progress {
  /** 挑戦できる最も進んだレッスン */
  kochLesson: number;
  kochHistory: KochRecord[];
  charStats: CharStats;
  /** 'YYYY-MM-DD' → 練習秒数 */
  practiceLog: Record<string, number>;
  callsignBest: { score: number; maxWpm: number; date: string } | null;
  icrHistory: { date: string; accuracy: number; avgRt: number; count: number }[];
  qsoHistory: { date: string; kind: string; correct: number; total: number }[];
  wordHistory: { date: string; correct: number; total: number }[];
}

export const DEFAULT_PROGRESS: Progress = {
  kochLesson: 1,
  kochHistory: [],
  charStats: {},
  practiceLog: {},
  callsignBest: null,
  icrHistory: [],
  qsoHistory: [],
  wordHistory: [],
};

const SETTINGS_KEY = 'study-morse:settings:v1';
const PROGRESS_KEY = 'study-morse:progress:v1';

function load<T extends object>(key: string, defaults: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return structuredClone(defaults);
    return mergeDefaults(defaults, JSON.parse(raw));
  } catch {
    return structuredClone(defaults);
  }
}

/** 保存データに無い項目は既定値で補う (アプリ更新で項目が増えても壊れないように) */
export function mergeDefaults<T extends object>(defaults: T, value: unknown): T {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return structuredClone(defaults);
  const out = structuredClone(defaults) as Record<string, unknown>;
  const isPlainObject = (x: unknown): x is object => typeof x === 'object' && x !== null && !Array.isArray(x);
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const d = (defaults as Record<string, unknown>)[k];
    if (d === undefined) continue;
    if (Array.isArray(d)) {
      if (Array.isArray(v)) out[k] = v;
    } else if (isPlainObject(d)) {
      // キーが決まっているオブジェクトは再帰的に補完、自由なキーの辞書 ({}) はそのまま採用
      if (Object.keys(d).length > 0) out[k] = mergeDefaults(d, v);
      else if (isPlainObject(v)) out[k] = v;
    } else if (d === null) {
      out[k] = v;
    } else if (typeof v === typeof d && (typeof v !== 'number' || Number.isFinite(v))) {
      out[k] = v;
    }
  }
  return out as T;
}

export const settings = signal<Settings>(load(SETTINGS_KEY, DEFAULT_SETTINGS));
export const progress = signal<Progress>(load(PROGRESS_KEY, DEFAULT_PROGRESS));

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 容量不足・プライベートモードなど */
  }
}

effect(() => save(SETTINGS_KEY, settings.value));
effect(() => save(PROGRESS_KEY, progress.value));

export function updateSettings(patch: Partial<Settings>): void {
  const next = { ...settings.value, ...patch };
  next.charWpm = clamp(Math.round(next.charWpm), 5, 50);
  next.effWpm = clamp(Math.round(next.effWpm), 3, next.charWpm);
  settings.value = next;
}

export function updateProgress(fn: (p: Progress) => Progress): void {
  progress.value = fn(progress.value);
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** 端末のローカル日付 'YYYY-MM-DD' */
export function today(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function logPractice(seconds: number): void {
  const s = Math.round(Math.max(0, Math.min(seconds, 45 * 60)));
  if (s < 3) return;
  const key = today();
  updateProgress((p) => ({ ...p, practiceLog: { ...p.practiceLog, [key]: (p.practiceLog[key] ?? 0) + s } }));
}

/** 今日を含めて何日続けて練習しているか */
export function streakDays(log: Record<string, number>, now = new Date()): number {
  let n = 0;
  const d = new Date(now);
  // 今日まだ練習していなくても、昨日まで続いていれば連続とみなす
  if (!log[today(d)]) d.setDate(d.getDate() - 1);
  while (log[today(d)]) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function activeConditions(mode: PracticeMode): Conditions | undefined {
  const s = settings.value;
  return s.conditionsOn[mode] ? s.conditions : undefined;
}

/* ---------------- バックアップ ---------------- */

export interface Backup {
  app: 'study-morse';
  version: 1;
  exportedAt: string;
  settings: Settings;
  progress: Progress;
}

export function exportBackup(): Backup {
  return { app: 'study-morse', version: 1, exportedAt: new Date().toISOString(), settings: settings.value, progress: progress.value };
}

export function importBackup(data: unknown): void {
  if (typeof data !== 'object' || data === null || (data as Backup).app !== 'study-morse') {
    throw new Error('このアプリのバックアップファイルではありません');
  }
  const b = data as Backup;
  settings.value = mergeDefaults(DEFAULT_SETTINGS, b.settings);
  const p = mergeDefaults(DEFAULT_PROGRESS, b.progress);
  p.kochLesson = clampLesson(p.kochLesson);
  progress.value = p;
}

export function resetProgress(): void {
  progress.value = structuredClone(DEFAULT_PROGRESS);
}
