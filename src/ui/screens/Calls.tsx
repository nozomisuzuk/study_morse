import { useEffect, useRef, useState } from 'preact/hooks';
import { audio } from '../../audio/engine';
import { vibrate } from '../../audio/device';
import { callsign, type CallKind } from '../../core/generators';
import { tokenize } from '../../core/morse';
import { createRng } from '../../core/rng';
import { score, stripSpaces, type ScoreResult } from '../../core/scoring';
import { recordAlignment } from '../../core/stats';
import { activeConditions, progress, settings, updateProgress, updateSettings } from '../../state/store';
import { Card, Segmented, TokenText, ToggleField, TopBar, percent } from '../components/common';
import { DiffView } from '../components/DiffView';
import { Keypad } from '../components/Keypad';
import { keyToToken, toneOf, useKeyboard, usePracticeTimer, useSessionGuards } from '../hooks';
import { navigate } from '../router';

type Phase = 'setup' | 'run' | 'result';
const COUNT = 20;

interface Attempt {
  call: string;
  typed: string;
  ok: boolean;
  wpm: number;
  points: number;
}

/**
 * コールサイン受信。速度可変モードでは正解すると速く、間違えると遅くなる
 * (コンテスト練習ソフト RufzXP と同じ考え方)。
 */
export function Calls() {
  const s = settings.value;
  const [kind, setKind] = useState<CallKind>('ja');
  const [portable, setPortable] = useState(false);
  const [adaptive, setAdaptive] = useState(true);
  const [phase, setPhase] = useState<Phase>('setup');
  const [call, setCall] = useState('');
  const [wpm, setWpm] = useState(s.effWpm);
  const [input, setInput] = useState<string[]>([]);
  const [checked, setChecked] = useState<ScoreResult | null>(null);
  const [replayed, setReplayed] = useState(false);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const rng = useRef(createRng());
  const conditions = activeConditions('calls');

  useSessionGuards(phase === 'run');
  usePracticeTimer(phase === 'run');
  useEffect(() => () => clearTimeout(timer.current), []);

  /** 遅い速度では文字速度を保ったまま文字間を広げる (Farnsworth) */
  const timingFor = (w: number) => ({ charWpm: Math.max(settings.value.charWpm, w), effWpm: w });

  const play = (c: string, w: number) => audio.play([{ text: c, timing: timingFor(w) }], { tone: toneOf(), conditions });

  const ask = (w: number) => {
    const c = callsign(rng.current, { kind, portable });
    setCall(c);
    setInput([]);
    setChecked(null);
    setReplayed(false);
    timer.current = window.setTimeout(() => void play(c, w), 300);
  };

  const start = () => {
    const w = settings.value.effWpm;
    setWpm(w);
    setAttempts([]);
    setPhase('run');
    ask(w);
  };

  const submit = () => {
    if (checked) return;
    const r = score(stripSpaces(tokenize(call)), stripSpaces(input));
    const ok = r.errors === 0;
    setChecked(r);
    if (!ok) vibrate(60);
    updateProgress((p) => ({ ...p, charStats: recordAlignment(p.charStats, r.ops) }));
    const points = ok ? Math.round((wpm * call.length) / (replayed ? 2 : 1)) : 0;
    const all = [...attempts, { call, typed: input.join(''), ok, wpm, points }];
    setAttempts(all);
    const nextWpm = adaptive ? Math.max(5, Math.min(60, wpm + (ok ? 2 : -2))) : wpm;
    if (all.length >= COUNT) {
      const total = all.reduce((a, x) => a + x.points, 0);
      const maxWpm = Math.max(...all.filter((x) => x.ok).map((x) => x.wpm), 0);
      const best = progress.value.callsignBest;
      if (!best || total > best.score) {
        updateProgress((p) => ({ ...p, callsignBest: { score: total, maxWpm, date: new Date().toISOString() } }));
      }
    }
    timer.current = window.setTimeout(
      () => {
        if (all.length >= COUNT) {
          setPhase('result');
          return;
        }
        setWpm(nextWpm);
        ask(nextWpm);
      },
      ok ? 900 : 2200,
    );
  };

  useKeyboard((key, e) => {
    if (phase !== 'run' || checked) return;
    if (key === 'Backspace') {
      e.preventDefault();
      setInput((i) => i.slice(0, -1));
    } else if (key === 'Enter') {
      e.preventDefault();
      submit();
    } else {
      const t = keyToToken(key);
      if (t) setInput((i) => [...i, t]);
    }
  }, phase === 'run');

  if (phase === 'setup') {
    const best = progress.value.callsignBest;
    return (
      <div class="session">
        <TopBar title="コールサイン" back="/practice" />
        <Card>
          <p style={{ marginTop: 0 }}>流れてきたコールサインを入力します。実際の交信やコンテストで最初に取るのはコールサインです。</p>
          <Segmented
            value={kind}
            options={[
              { value: 'ja', label: '国内 (JA)' },
              { value: 'dx', label: '海外 (DX)' },
              { value: 'mixed', label: 'まぜる' },
            ]}
            onChange={setKind}
          />
          <ToggleField label="速度を自動で変える" desc="正解で +2 WPM、不正解で −2 WPM。限界の速度で練習できます。" checked={adaptive} onChange={setAdaptive} />
          <ToggleField label="移動運用 (/1, /P など) を含める" checked={portable} onChange={setPortable} />
          <ToggleField
            label="ノイズなどの受信環境を使う"
            checked={s.conditionsOn.calls}
            onChange={(v) => updateSettings({ conditionsOn: { ...s.conditionsOn, calls: v } })}
          />
          <p class="muted small">開始速度は実効速度 ({s.effWpm} WPM)。もう一度聞くと得点は半分になります。</p>
          {best && (
            <p class="small" style={{ margin: 0 }}>
              自己ベスト: <b>{best.score}</b> 点 (最高 {best.maxWpm} WPM)
            </p>
          )}
        </Card>
        <button class="btn primary block big" onClick={start}>
          始める ({COUNT} 局)
        </button>
      </div>
    );
  }

  if (phase === 'result') {
    const ok = attempts.filter((a) => a.ok).length;
    const total = attempts.reduce((a, x) => a + x.points, 0);
    const maxWpm = Math.max(...attempts.filter((x) => x.ok).map((x) => x.wpm), 0);
    return (
      <div class="session">
        <TopBar title="コールサインの結果" back="/practice" />
        <Card>
          <div class="stat-row">
            <div>
              <b>{total}</b>
              <span>得点</span>
            </div>
            <div>
              <b>{percent(ok / attempts.length)}</b>
              <span>正答率</span>
            </div>
            <div>
              <b>{maxWpm || '—'}</b>
              <span>最高 WPM</span>
            </div>
          </div>
        </Card>
        <Card title="記録">
          {attempts.map((a, i) => (
            <button key={i} class="list-item" onClick={() => void play(a.call, a.wpm)}>
              <span class="code" style={{ color: a.ok ? 'var(--ok)' : 'var(--ng)' }}>
                {a.call}
              </span>
              <span class="muted small spacer">{a.ok ? '' : `入力: ${a.typed || '(なし)'}`}</span>
              <span class="muted small">{a.wpm} WPM</span>
            </button>
          ))}
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
        title="コールサイン"
        back={() => {
          audio.stop();
          clearTimeout(timer.current);
          setPhase('setup');
        }}
      />
      <div class="session-info">
        <span>
          <b>{Math.min(attempts.length + (checked ? 0 : 1), COUNT)}</b> / {COUNT}
        </span>
        <span>
          <b>{wpm}</b> WPM
        </span>
        <span class="spacer" />
        <button
          class="btn"
          disabled={!!checked}
          onClick={() => {
            setReplayed(true);
            void play(call, wpm);
          }}
        >
          ↻ もう一度
        </button>
      </div>
      <div class="answer-area" aria-live="polite">
        {checked ? (
          <DiffView ops={checked.ops} />
        ) : (
          <div class="typed">
            {input.length ? <TokenText tokens={input} /> : <span class="muted small">コールサインを入力</span>}
            <span class="caret" />
          </div>
        )}
      </div>
      <div class="spacer" />
      <Keypad
        onKey={(t) => !checked && setInput((i) => [...i, t])}
        onBackspace={() => !checked && setInput((i) => i.slice(0, -1))}
        onSubmit={submit}
        submitLabel="答え合わせ"
        disabled={!!checked}
      />
    </div>
  );
}
