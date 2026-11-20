import { useEffect, useRef, useState } from 'preact/hooks';
import { audio } from '../../audio/engine';
import { vibrate } from '../../audio/device';
import { KOCH_ORDER, lessonChars } from '../../core/koch';
import { createRng, pickWeighted } from '../../core/rng';
import { charWeights, recordChar } from '../../core/stats';
import { activeConditions, progress, settings, updateProgress, updateSettings } from '../../state/store';
import { Card, Segmented, Tok, TopBar, heatColor, percent } from '../components/common';
import { Keypad } from '../components/Keypad';
import { keyToToken, toneOf, useKeyboard, usePracticeTimer, useSessionGuards } from '../hooks';
import { navigate } from '../router';

type Phase = 'setup' | 'run' | 'result';

interface Trial {
  ch: string;
  answer: string | null;
  rt: number | null;
}

/**
 * 瞬時認識ドリル: 1 文字を聞いたら、できるだけ速くその文字のキーを押す。
 * 「考えて思い出す」のではなく、音を聞いた瞬間に文字が浮かぶ反射を作る。
 */
export function Icr() {
  const s = settings.value;
  const learned = lessonChars(progress.value.kochLesson);
  const [scope, setScope] = useState<'learned' | 'all'>('learned');
  const chars = scope === 'learned' ? learned : [...KOCH_ORDER];
  const [phase, setPhase] = useState<Phase>('setup');
  const [trials, setTrials] = useState<Trial[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; ch: string; answer: string; rt: number } | null>(null);
  const endAt = useRef<number>(0);
  const accepting = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const rng = useRef(createRng());

  useSessionGuards(phase === 'run');
  usePracticeTimer(phase === 'run');
  useEffect(() => () => clearTimeout(timer.current), []);

  const conditions = activeConditions('icr');
  const timing = { charWpm: s.charWpm, effWpm: s.charWpm };

  const ask = (prev: string | null) => {
    const weights = charWeights(chars, progress.value.charStats, [], true).map((w, i) => (chars[i] === prev ? w * 0.15 : w));
    const ch = pickWeighted(rng.current, chars, weights);
    setCurrent(ch);
    setFeedback(null);
    accepting.current = true;
    endAt.current = Number.POSITIVE_INFINITY;
    void audio.play([{ text: ch, timing }], {
      tone: toneOf(),
      conditions,
      onSchedule: (_i, perfStart, tl) => {
        endAt.current = perfStart + (tl.marks[0]?.end ?? 0) * 1000;
      },
    });
  };

  const start = () => {
    setTrials([]);
    setPhase('run');
    timer.current = window.setTimeout(() => ask(null), 400);
  };

  const answer = (t: string) => {
    if (phase !== 'run' || !accepting.current || !current) return;
    accepting.current = false;
    const now = performance.now();
    const rt = Number.isFinite(endAt.current) ? Math.max(0, now - endAt.current) : 0;
    const ok = t === current;
    const trial: Trial = { ch: current, answer: t, rt: ok ? rt : null };
    const all = [...trials, trial];
    setTrials(all);
    updateProgress((p) => ({ ...p, charStats: recordChar(p.charStats, current, t, ok ? rt : undefined) }));
    setFeedback({ ok, ch: current, answer: t, rt });
    const last = all.length >= settings.value.icrCount;
    if (ok) {
      timer.current = window.setTimeout(() => (last ? finish(all) : ask(current)), 450);
    } else {
      vibrate(80);
      // 正解の音をもう一度聞かせてから次へ
      const ch = current;
      timer.current = window.setTimeout(() => {
        void audio.play([{ text: ch, timing }], { tone: toneOf() });
        timer.current = window.setTimeout(() => (last ? finish(all) : ask(ch)), 1300);
      }, 350);
    }
  };

  const finish = (all: Trial[]) => {
    audio.stop();
    const okTrials = all.filter((t) => t.answer === t.ch);
    const avgRt = okTrials.length ? okTrials.reduce((a, t) => a + (t.rt ?? 0), 0) / okTrials.length : 0;
    updateProgress((p) => ({
      ...p,
      icrHistory: [...p.icrHistory, { date: new Date().toISOString(), accuracy: okTrials.length / all.length, avgRt, count: all.length }].slice(-300),
    }));
    setPhase('result');
  };

  useKeyboard((key) => {
    const t = keyToToken(key);
    if (t && chars.includes(t)) answer(t);
  }, phase === 'run');

  if (phase === 'setup') {
    return (
      <div class="session">
        <TopBar title="瞬時認識ドリル" back="/practice" />
        <Card>
          <p style={{ marginTop: 0 }}>
            1 文字ずつ流れます。聞こえた瞬間に、その文字のキーをできるだけ速く押してください。正解までの反応時間を計り、遅い文字・間違えやすい文字ほど多く出題します。
          </p>
          <div class="stack">
            <Segmented
              value={scope}
              options={[
                { value: 'learned', label: `習得済み (${learned.length} 文字)` },
                { value: 'all', label: `全文字 (${KOCH_ORDER.length})` },
              ]}
              onChange={setScope}
            />
            <div class="row">
              <span class="spacer">出題数</span>
              <Segmented
                value={String(s.icrCount)}
                options={[
                  { value: '20', label: '20' },
                  { value: '30', label: '30' },
                  { value: '50', label: '50' },
                ]}
                onChange={(v) => updateSettings({ icrCount: Number(v) })}
              />
            </div>
            <p class="muted small" style={{ margin: 0 }}>
              速度は文字速度 ({s.charWpm} WPM) で送ります。目標は反応時間 0.5 秒以内です。
            </p>
          </div>
        </Card>
        <button class="btn primary block big" onClick={start}>
          始める
        </button>
      </div>
    );
  }

  if (phase === 'result') {
    const okTrials = trials.filter((t) => t.answer === t.ch);
    const avgRt = okTrials.length ? okTrials.reduce((a, t) => a + (t.rt ?? 0), 0) / okTrials.length : 0;
    const per = new Map<string, { ok: number; n: number; rt: number }>();
    for (const t of trials) {
      const e = per.get(t.ch) ?? { ok: 0, n: 0, rt: 0 };
      e.n++;
      if (t.answer === t.ch) {
        e.ok++;
        e.rt += t.rt ?? 0;
      }
      per.set(t.ch, e);
    }
    const rows = [...per.entries()]
      .map(([ch, e]) => ({ ch, acc: e.ok / e.n, rt: e.ok ? e.rt / e.ok : null, n: e.n }))
      .sort((a, b) => a.acc - b.acc || (b.rt ?? 9e9) - (a.rt ?? 9e9));
    return (
      <div class="session">
        <TopBar title="瞬時認識ドリルの結果" back="/practice" />
        <Card>
          <div class="stat-row">
            <div>
              <b>{percent(okTrials.length / trials.length)}</b>
              <span>正答率</span>
            </div>
            <div>
              <b>{(avgRt / 1000).toFixed(2)}s</b>
              <span>平均反応時間</span>
            </div>
            <div>
              <b>{trials.length}</b>
              <span>出題数</span>
            </div>
          </div>
        </Card>
        <Card title="文字ごとの結果 (苦手な順)">
          <div class="heat">
            {rows.map((r) => (
              <div key={r.ch} class="heat-cell" style={{ background: heatColor(r.acc) }}>
                <b>
                  <Tok t={r.ch} />
                </b>
                <span>{r.rt === null ? '×' : `${(r.rt / 1000).toFixed(2)}s`}</span>
              </div>
            ))}
          </div>
        </Card>
        <div class="stack">
          <button class="btn primary block big" onClick={start}>
            もう一度
          </button>
          <button class="btn block ghost" onClick={() => navigate('/practice')}>
            練習メニューへ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="session">
      <TopBar
        title="瞬時認識ドリル"
        back={() => {
          audio.stop();
          clearTimeout(timer.current);
          setPhase('setup');
        }}
      />
      <div class="session-info">
        <span>
          <b>{Math.min(trials.length + (feedback ? 0 : 1), s.icrCount)}</b> / {s.icrCount}
        </span>
        <span class="spacer" />
        <button class="btn" onClick={() => current && void audio.play([{ text: current, timing }], { tone: toneOf(), conditions })}>
          ↻ もう一度
        </button>
      </div>
      <div class="answer-area" aria-live="polite">
        {feedback ? (
          <>
            <div class={`big-char ${feedback.ok ? 'ok' : 'ng'}`}>
              <Tok t={feedback.ch} />
            </div>
            <div class="muted">
              {feedback.ok ? (
                `${(feedback.rt / 1000).toFixed(2)} 秒`
              ) : (
                <>
                  あなたの答え: <Tok t={feedback.answer} />
                </>
              )}
            </div>
          </>
        ) : (
          <div class="muted">聞こえた文字のキーを押してください</div>
        )}
      </div>
      <div class="spacer" />
      <Keypad keys={scope === 'learned' ? chars : undefined} onKey={answer} flash={feedback && !feedback.ok ? feedback.ch : null} />
    </div>
  );
}
