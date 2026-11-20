import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { audio } from '../../audio/engine';
import { vibrate } from '../../audio/device';
import { randomGroup } from '../../core/generators';
import { MAX_LESSON, PASS_ACCURACY, clampLesson, lessonChars, newCharsOf } from '../../core/koch';
import { MORSE, prettyCode } from '../../core/morse';
import { createRng } from '../../core/rng';
import { score, stripSpaces, type AlignOp, type ScoreResult } from '../../core/scoring';
import { charWeights, recordAlignment } from '../../core/stats';
import { spacing } from '../../core/timing';
import { activeConditions, progress, settings, updateProgress, updateSettings } from '../../state/store';
import { Card, ProgressBar, Segmented, Tok, TopBar, heatColor, percent } from '../components/common';
import { DiffView } from '../components/DiffView';
import { Keypad } from '../components/Keypad';
import { SpeedControl } from '../components/SpeedControl';
import { keyToToken, timingOf, toneOf, useKeyboard, usePracticeTimer, useSessionGuards } from '../hooks';
import { navigate, route } from '../router';

type Phase = 'intro' | 'run' | 'result';

interface Summary {
  accuracy: number;
  total: number;
  correct: number;
  passed: boolean;
  unlocked: boolean;
  perChar: { ch: string; ok: number; n: number }[];
  confusions: { ref: string; hyp: string; n: number }[];
}

export function KochLesson() {
  const unlockedLesson = progress.value.kochLesson;
  const requested = Number(route.value.query.get('lesson')) || unlockedLesson;
  const lesson = clampLesson(Math.min(requested, unlockedLesson));
  const chars = useMemo(() => lessonChars(lesson), [lesson]);
  const newChars = useMemo(() => newCharsOf(lesson), [lesson]);
  const s = settings.value;

  const [phase, setPhase] = useState<Phase>('intro');
  const [groups, setGroups] = useState<string[][]>([]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState<string[]>([]);
  const [checked, setChecked] = useState<ScoreResult | null>(null);
  const [results, setResults] = useState<ScoreResult[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [streamDone, setStreamDone] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const mode = s.kochMode;

  useSessionGuards(phase === 'run');
  usePracticeTimer(phase === 'run');
  useEffect(() => () => clearTimeout(timer.current), []);
  // レッスンが変わったら最初の画面に戻す
  useEffect(() => {
    audio.stop();
    clearTimeout(timer.current);
    setPhase('intro');
  }, [lesson]);

  const conditions = activeConditions('koch');

  const playGroup = (g: string[]) => {
    void audio.play([{ text: g.join(''), timing: timingOf() }], { tone: toneOf(), conditions });
  };

  const start = () => {
    const rng = createRng();
    const weights = charWeights(chars, progress.value.charStats, lesson === 1 ? [] : newChars);
    const gs = Array.from({ length: s.groupsPerSession }, () => randomGroup(rng, chars, weights, s.groupLen));
    setGroups(gs);
    setIdx(0);
    setInput([]);
    setChecked(null);
    setResults([]);
    setSummary(null);
    setStreamDone(false);
    setPhase('run');
    if (mode === 'group') {
      timer.current = window.setTimeout(() => playGroup(gs[0]), 350);
    } else {
      const sp = spacing(timingOf());
      const gap = Math.max(0, sp.wordGap - 0.15); // 各送信の前後に入る余白 (0.05+0.1 秒) を差し引く
      timer.current = window.setTimeout(async () => {
        await audio.play(
          gs.map((g) => ({ text: g.join(''), timing: timingOf(), gapAfter: gap })),
          { tone: toneOf(), conditions },
        );
        setStreamDone(true);
      }, 350);
    }
  };

  const finish = (all: ScoreResult[]) => {
    audio.stop();
    let total = 0;
    let correct = 0;
    let errors = 0;
    const per = new Map<string, { ok: number; n: number }>();
    const conf = new Map<string, number>();
    const ops: AlignOp[] = all.flatMap((r) => r.ops);
    for (const r of all) {
      total += r.total;
      correct += r.correct;
      errors += r.errors;
    }
    for (const op of ops) {
      if (op.type === 'ins') continue;
      const e = per.get(op.ref) ?? { ok: 0, n: 0 };
      e.n++;
      if (op.type === 'match') e.ok++;
      per.set(op.ref, e);
      if (op.type === 'sub') conf.set(`${op.ref}\u0000${op.hyp}`, (conf.get(`${op.ref}\u0000${op.hyp}`) ?? 0) + 1);
    }
    const accuracy = total > 0 ? Math.max(0, total - errors) / total : 0;
    const passed = accuracy >= PASS_ACCURACY && total >= 25;
    const unlocked = passed && lesson === progress.value.kochLesson && lesson < MAX_LESSON;
    updateProgress((p) => ({
      ...p,
      kochLesson: unlocked ? lesson + 1 : p.kochLesson,
      kochHistory: [
        ...p.kochHistory,
        { date: new Date().toISOString(), lesson, accuracy, chars: total, charWpm: settings.value.charWpm, effWpm: settings.value.effWpm },
      ].slice(-300),
    }));
    setSummary({
      accuracy,
      total,
      correct,
      passed,
      unlocked,
      perChar: chars.filter((c) => per.has(c)).map((c) => ({ ch: c, ...per.get(c)! })),
      confusions: [...conf.entries()]
        .map(([k, n]) => {
          const [ref, hyp] = k.split('\u0000');
          return { ref, hyp, n };
        })
        .sort((a, b) => b.n - a.n)
        .slice(0, 6),
    });
    setPhase('result');
  };

  const next = (all: ScoreResult[]) => {
    clearTimeout(timer.current);
    const n = idx + 1;
    if (n >= groups.length) {
      finish(all);
      return;
    }
    setIdx(n);
    setInput([]);
    setChecked(null);
    timer.current = window.setTimeout(() => playGroup(groups[n]), 250);
  };

  const check = (typed: string[]) => {
    if (checked || mode !== 'group') return;
    const r = score(groups[idx], typed);
    const all = [...results, r];
    setChecked(r);
    setResults(all);
    updateProgress((p) => ({ ...p, charStats: recordAlignment(p.charStats, r.ops) }));
    if (r.errors > 0) vibrate(60);
    if (settings.value.autoAdvance) {
      timer.current = window.setTimeout(() => next(all), r.errors === 0 ? 650 : 1700);
    }
  };

  const scoreStream = () => {
    const ref = groups.flat();
    const r = score(ref, stripSpaces(input));
    updateProgress((p) => ({ ...p, charStats: recordAlignment(p.charStats, r.ops) }));
    setChecked(r);
    finish([r]);
  };

  const onKey = (t: string) => {
    if (phase !== 'run' || checked) return;
    const nextInput = [...input, t];
    setInput(nextInput);
    if (mode === 'group' && nextInput.length >= s.groupLen) check(nextInput);
  };
  const onBackspace = () => {
    if (phase !== 'run' || checked) return;
    setInput((i) => i.slice(0, -1));
  };

  useKeyboard((key, e) => {
    if (phase !== 'run') return;
    if (key === 'Backspace') {
      e.preventDefault();
      onBackspace();
    } else if (key === 'Enter') {
      e.preventDefault();
      if (mode === 'stream') scoreStream();
      else if (checked) next(results);
      else check(input);
    } else if (key === ' ' && mode === 'stream') {
      e.preventDefault();
      setInput((i) => (i.length && i[i.length - 1] !== ' ' ? [...i, ' '] : i));
    } else {
      const t = keyToToken(key);
      if (t && chars.includes(t)) onKey(t);
    }
  });

  const playIntro = () => {
    const text = newChars.map((c) => `${c} ${c} ${c}`).join('   ');
    void audio.play([{ text, timing: { charWpm: s.charWpm, effWpm: Math.min(s.effWpm, 10) } }], { tone: toneOf() });
  };

  /* ---------------- 画面 ---------------- */

  if (phase === 'intro') {
    return (
      <div class="session">
        <TopBar title={`レッスン ${lesson} / ${MAX_LESSON}`} back="/" />
        <Card>
          <p class="muted small" style={{ margin: 0 }}>
            {lesson === 1 ? '最初の 2 文字' : '新しい文字'}
          </p>
          <div class="row" style={{ justifyContent: 'center', gap: '24px', margin: '8px 0' }}>
            {newChars.map((c) => (
              <div key={c} class="center">
                <div class="big-char">
                  <Tok t={c} />
                </div>
                {s.showCodes && <div class="code-hint">{prettyCode(MORSE[c])}</div>}
              </div>
            ))}
          </div>
          <button class="btn block big" onClick={playIntro}>
            ▶ 新しい文字の音を聞く
          </button>
          <p class="muted small">
            符号を「・－」で覚えて数えるのではなく、音のリズム全体を文字として覚えるのがコツです。
            {s.showCodes ? '' : ' (符号の表示は設定で ON にできます)'}
          </p>
        </Card>
        <Card title="このレッスンで使う文字">
          <div class="chips">
            {chars.map((c) => (
              <button
                key={c}
                class={`chip ${newChars.includes(c) ? 'new' : ''}`}
                onClick={() => void audio.playText(c, timingOf(), toneOf())}
                aria-label={`${c} を聞く`}
              >
                <Tok t={c} />
              </button>
            ))}
          </div>
          <p class="muted small">文字をタップすると音を確認できます。</p>
        </Card>
        <Card>
          <div class="stack">
            <Segmented
              value={mode}
              options={[
                { value: 'group', label: '1 グループずつ答える' },
                { value: 'stream', label: 'まとめて聞く' },
              ]}
              onChange={(v) => updateSettings({ kochMode: v })}
            />
            <p class="muted small" style={{ margin: '6px 0 0' }}>
              {mode === 'group'
                ? `${s.groupLen} 文字のグループを ${s.groupsPerSession} 回。1 グループごとに答え合わせします。`
                : `${s.groupsPerSession} グループを続けて流します。聞きながら入力し、最後にまとめて採点します (実際の受信に近い形式)。`}
            </p>
            <SpeedControl />
          </div>
        </Card>
        <button class="btn primary block big" onClick={start}>
          練習を始める
        </button>
        <p class="muted small center">正答率 {percent(PASS_ACCURACY)} 以上で次の文字が追加されます。</p>
      </div>
    );
  }

  if (phase === 'result' && summary) {
    const hasNext = lesson < MAX_LESSON;
    return (
      <div class="session">
        <TopBar title={`レッスン ${lesson} の結果`} back="/" />
        <Card>
          <div class={`result-big ${summary.passed ? 'ok' : 'ng'}`}>{percent(summary.accuracy)}</div>
          <p class="center" style={{ margin: 0 }}>
            {summary.correct} / {summary.total} 文字
          </p>
          <div class="notice" style={{ marginTop: '12px' }}>
            {summary.passed
              ? summary.unlocked
                ? `合格です！ レッスン ${lesson + 1} (新しい文字が 1 つ増えます) に進めるようになりました。`
                : hasNext
                  ? '合格ラインを超えました。'
                  : 'おめでとうございます！ すべての文字を習得しました。単語・コールサイン・交信の練習に進みましょう。'
              : summary.total < 25
                ? '採点する文字が少なすぎます (25 文字以上必要)。最後まで聞いて入力してみましょう。'
                : `合格ライン (${percent(PASS_ACCURACY)}) まであと少し。同じレッスンを繰り返すと確実に伸びます。`}
          </div>
        </Card>
        {summary.perChar.length > 0 && (
          <Card title="文字ごとの正答率">
            <div class="heat">
              {summary.perChar.map((c) => (
                <div key={c.ch} class="heat-cell" style={{ background: heatColor(c.ok / c.n) }}>
                  <b>
                    <Tok t={c.ch} />
                  </b>
                  <span>
                    {c.ok}/{c.n}
                  </span>
                </div>
              ))}
            </div>
            {summary.confusions.length > 0 && (
              <>
                <h3>聞き間違え</h3>
                <ul class="small" style={{ margin: 0, paddingLeft: '1.2em' }}>
                  {summary.confusions.map((c) => (
                    <li key={c.ref + c.hyp}>
                      <b class="mono">
                        <Tok t={c.ref} />
                      </b>{' '}
                      を{' '}
                      <b class="mono">
                        <Tok t={c.hyp} />
                      </b>{' '}
                      と入力 ×{c.n}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        )}
        <div class="stack">
          {summary.unlocked && (
            <button class="btn primary block big" onClick={() => navigate(`/koch?lesson=${lesson + 1}`)}>
              レッスン {lesson + 1} へ進む
            </button>
          )}
          <button class={`btn block big ${summary.unlocked ? '' : 'primary'}`} onClick={start}>
            もう一度このレッスン
          </button>
          <button class="btn block ghost" onClick={() => navigate('/')}>
            ホームに戻る
          </button>
        </div>
      </div>
    );
  }

  // 練習中
  const done = mode === 'group' ? idx + (checked ? 1 : 0) : 0;
  const runningAcc =
    results.length > 0 ? results.reduce((a, r) => a + Math.max(0, r.total - r.errors), 0) / results.reduce((a, r) => a + r.total, 0) : null;

  return (
    <div class="session">
      <TopBar
        title={`レッスン ${lesson}`}
        back={() => {
          audio.stop();
          setPhase('intro');
        }}
      />
      {mode === 'group' ? (
        <>
          <div class="session-info">
            <span>
              <b>{Math.min(idx + 1, groups.length)}</b> / {groups.length}
            </span>
            <div class="spacer">
              <ProgressBar value={done / groups.length} />
            </div>
            <span>{runningAcc === null ? '—' : percent(runningAcc)}</span>
          </div>
          <div class="answer-area" aria-live="polite">
            {checked ? (
              <DiffView ops={checked.ops} />
            ) : (
              <div class="slots">
                {Array.from({ length: s.groupLen }, (_, i) => (
                  <div key={i} class={`slot ${i === input.length ? 'cur' : ''}`}>
                    {input[i] ? <Tok t={input[i]} /> : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div class="btn-row">
            <button class="btn" onClick={() => playGroup(groups[idx])}>
              ↻ もう一度聞く
            </button>
            {checked ? (
              !settings.value.autoAdvance && (
                <button class="btn primary" onClick={() => next(results)}>
                  次へ
                </button>
              )
            ) : (
              <button class="btn" onClick={() => check(input)}>
                わからない／採点
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div class="session-info">
            <span>{streamDone ? '再生が終わりました。入力を確認して採点してください。' : '聞こえた文字をどんどん入力してください。分からない文字は飛ばして OK。'}</span>
          </div>
          <div class="answer-area">
            <div class="typed">
              {input.map((t, i) => (t === ' ' ? <span key={i}> </span> : <Tok key={i} t={t} />))}
              <span class="caret" />
            </div>
            <span class="muted small">{stripSpaces(input).length} 文字入力</span>
          </div>
          <div class="btn-row">
            <button class="btn" onClick={() => audio.stop()}>
              ■ 停止
            </button>
            <button class={`btn ${streamDone ? 'primary' : ''}`} onClick={scoreStream}>
              採点する
            </button>
          </div>
        </>
      )}
      <div class="spacer" />
      <Keypad
        keys={chars}
        onKey={onKey}
        onBackspace={onBackspace}
        onSpace={mode === 'stream' ? () => setInput((i) => (i.length && i[i.length - 1] !== ' ' ? [...i, ' '] : i)) : undefined}
        disabled={mode === 'group' && !!checked}
      />
    </div>
  );
}
