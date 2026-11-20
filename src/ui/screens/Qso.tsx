import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { audio, type Transmission } from '../../audio/engine';
import { lookupAbbrev } from '../../core/data/abbreviations';
import { checkAnswer, generateQso, qsoKindLabel, type Qso as QsoData, type QsoKind } from '../../core/generators';
import { MAX_LESSON } from '../../core/koch';
import { displayText, isProsign, tokenize } from '../../core/morse';
import { createRng, randInt } from '../../core/rng';
import { normalizeAnswer, uncutNumber } from '../../core/scoring';
import { activeConditions, progress, settings, updateProgress, updateSettings } from '../../state/store';
import { Card, TokenText, ToggleField, TopBar } from '../components/common';
import { Keypad } from '../components/Keypad';
import { SpeedControl } from '../components/SpeedControl';
import { keyToToken, toneOf, useKeyboard, usePracticeTimer, useSessionGuards } from '../hooks';
import { navigate } from '../router';

type Phase = 'setup' | 'listen' | 'review';

const KINDS: QsoKind[] = ['cq', 'reply', 'ragchew', 'contest', 'dx'];
const KIND_DESC: Record<QsoKind, string> = {
  cq: '短い CQ からコールサインだけを取る。最初の一歩に。',
  reply: '自分が CQ を出したら呼ばれた、という場面。相手の情報を取る。',
  ragchew: '国内局どうしの定型の交信をまるごと聞く。',
  contest: 'コンテストの短い交換。速くて短い。',
  dx: '海外局と日本の局の交信。',
};

interface Voice {
  toneHz: number;
  charWpm: number;
  effWpm: number;
}

export function Qso() {
  const s = settings.value;
  const [kind, setKind] = useState<QsoKind>('cq');
  const [showText, setShowText] = useState(false);
  const [phase, setPhase] = useState<Phase>('setup');
  const [qso, setQso] = useState<QsoData | null>(null);
  const [voices, setVoices] = useState<{ A: Voice; B: Voice } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentLine, setCurrentLine] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [focus, setFocus] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, boolean> | null>(null);
  const [gloss, setGloss] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  /** 受信環境 (QSB・混信など) の乱数。同じ交信を聞き直すときに同じ条件になるよう保持する */
  const seedRef = useRef(0);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useSessionGuards(phase !== 'setup');
  usePracticeTimer(phase === 'listen');
  useEffect(() => () => clearTimers(), []);

  const conditions = activeConditions('qso');

  function clearTimers() {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
  }

  const newQso = () => {
    const rng = createRng();
    const q = generateQso(kind, rng, { myCall: settings.value.myCall });
    // 局ごとに少しずつ音の高さと速さを変える (実際の交信に近づける)
    const base = settings.value.toneHz;
    const dA = randInt(rng, -50, 50);
    let dB = randInt(rng, -60, 60);
    if (Math.abs(dB - dA) < 40) dB = dA + (dA > 0 ? -50 : 50);
    const voice = (d: number): Voice => {
      const charWpm = Math.max(5, settings.value.charWpm + randInt(rng, -2, 2));
      const effWpm = Math.min(charWpm, Math.max(3, settings.value.effWpm + randInt(rng, -1, 1)));
      return { toneHz: base + d, charWpm, effWpm };
    };
    const v = { A: voice(dA), B: voice(dB) };
    setQso(q);
    setVoices(v);
    seedRef.current = Math.floor(rng.next() * 2 ** 31);
    setAnswers(Object.fromEntries(q.questions.map((x) => [x.id, [] as string[]])));
    setFocus(q.questions[0]?.id ?? null);
    setResults(null);
    setGloss(null);
    setCurrentLine(null);
    setPhase('listen');
    return { q, v };
  };

  const playLines = async (q: QsoData, v: { A: Voice; B: Voice }, only?: number) => {
    clearTimers();
    const indices = q.lines.map((_, i) => i).filter((i) => (only === undefined ? !q.lines[i].silent : i === only));
    const items: Transmission[] = [];
    const lineOf: number[] = [];
    for (const i of indices) {
      const line = q.lines[i];
      const voice = v[line.station];
      // 次の行が自分の送信 (再生しない) なら、その分の間を空ける
      const nextSilent = only === undefined && q.lines[i + 1]?.silent;
      items.push({
        text: line.text,
        timing: { charWpm: voice.charWpm, effWpm: voice.effWpm },
        toneHz: voice.toneHz,
        gapAfter: nextSilent ? 3 : 1.1,
      });
      lineOf.push(i);
    }
    setPlaying(true);
    const done = await audio.play(items, {
      tone: toneOf(),
      conditions,
      seed: seedRef.current,
      onSchedule: (k, perfStart) => {
        const delay = Math.max(0, perfStart - performance.now());
        timers.current.push(window.setTimeout(() => setCurrentLine(lineOf[k]), delay));
      },
    });
    if (done || !audio.isPlaying) {
      setPlaying(false);
      setCurrentLine(null);
    }
  };

  const stop = () => {
    audio.stop();
    clearTimers();
    setPlaying(false);
    setCurrentLine(null);
  };

  const start = () => {
    const { q, v } = newQso();
    window.setTimeout(() => void playLines(q, v), 400);
  };

  const check = () => {
    if (!qso) return;
    stop();
    const r: Record<string, boolean> = {};
    for (const q of qso.questions) r[q.id] = checkAnswer(q, (answers[q.id] ?? []).join(''), normalizeAnswer, uncutNumber);
    setResults(r);
    const correct = Object.values(r).filter(Boolean).length;
    updateProgress((p) => ({
      ...p,
      qsoHistory: [...p.qsoHistory, { date: new Date().toISOString(), kind: qso.kind, correct, total: qso.questions.length }].slice(-300),
    }));
    setPhase('review');
  };

  const type = (t: string) => {
    if (!focus || results) return;
    setAnswers((a) => ({ ...a, [focus]: [...(a[focus] ?? []), t] }));
  };
  const backspace = () => {
    if (!focus || results) return;
    setAnswers((a) => ({ ...a, [focus]: (a[focus] ?? []).slice(0, -1) }));
  };
  const nextField = () => {
    if (!qso) return;
    const i = qso.questions.findIndex((q) => q.id === focus);
    if (i < qso.questions.length - 1) setFocus(qso.questions[i + 1].id);
    else check();
  };

  useKeyboard((key, e) => {
    if (phase !== 'listen') return;
    if (key === 'Backspace') {
      e.preventDefault();
      backspace();
    } else if (key === 'Enter' || key === 'Tab') {
      e.preventDefault();
      nextField();
    } else if (key === ' ') {
      e.preventDefault();
      type(' ');
    } else {
      const t = keyToToken(key);
      if (t) type(t);
    }
  }, phase === 'listen');

  // 再生中の行が見えるよう、文の表示枠を自動でスクロールする
  useEffect(() => {
    if (currentLine === null) return;
    const box = transcriptRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-line="${currentLine}"]`);
    if (box && el) box.scrollTo({ top: el.offsetTop - box.offsetTop - 8, behavior: 'smooth' });
  }, [currentLine]);

  const glossInfo = useMemo(() => (gloss ? lookupAbbrev(gloss) : undefined), [gloss]);

  if (phase === 'setup') {
    const notReady = progress.value.kochLesson < MAX_LESSON;
    return (
      <div class="session">
        <TopBar title="交信 (QSO) を聞く" back="/practice" />
        {notReady && (
          <div class="notice">
            交信の練習には全部の文字が必要です。Koch 講座の途中でも挑戦できますが、まだ習っていない文字は「見ながら聞く」を ON にして耳を慣らす使い方がおすすめです。
          </div>
        )}
        <Card title="場面を選ぶ">
          <div class="stack">
            {KINDS.map((k) => (
              <button
                key={k}
                class="list-item"
                style={{ borderRadius: '10px', padding: '10px', background: kind === k ? 'var(--accent-soft)' : 'transparent' }}
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
              >
                <span style={{ fontWeight: 700, minWidth: '1.4em' }}>{kind === k ? '●' : '○'}</span>
                <span>
                  <b>{qsoKindLabel(k)}</b>
                  <br />
                  <span class="muted small">{KIND_DESC[k]}</span>
                </span>
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <ToggleField label="見ながら聞く" desc="送信中の文を表示します。最初は文の流れをつかむのに使いましょう。" checked={showText} onChange={setShowText} />
          <ToggleField
            label="ノイズなどの受信環境を使う"
            desc="設定画面で強さを変えられます。"
            checked={s.conditionsOn.qso}
            onChange={(v) => updateSettings({ conditionsOn: { ...s.conditionsOn, qso: v } })}
          />
          <div class="field">
            <SpeedControl />
            <p class="muted small">局ごとに速さと音の高さを少しずつ変えて再生します。</p>
          </div>
        </Card>
        <button class="btn primary block big" onClick={start}>
          聞いてみる
        </button>
      </div>
    );
  }

  if (!qso || !voices) return null;

  /** 1 行の文を語に分けて表示する。略符号は上線つき、答え合わせ後は略語をタップで意味表示 */
  const renderWords = (text: string): JSX.Element[] => {
    const words: string[][] = [[]];
    for (const t of tokenize(text)) {
      if (t === ' ') words.push([]);
      else words[words.length - 1].push(t);
    }
    return words.map((w, k) => {
      const label = displayText(w);
      const cls = w.length === 1 && isProsign(w[0]) ? 'prosign' : '';
      if (phase === 'review' && lookupAbbrev(label)) {
        return (
          <span key={k}>
            <button class={`abbr ${cls}`} onClick={() => setGloss(label)}>
              {label}
            </button>{' '}
          </span>
        );
      }
      return (
        <span key={k} class={cls}>
          {label}{' '}
        </span>
      );
    });
  };

  const transcript = (withJa: boolean, scroll = false) => (
    <div class={`transcript ${scroll ? 'scroll' : ''}`} ref={scroll ? transcriptRef : undefined}>
      {qso.lines.map((line, i) => {
        const call = line.station === 'A' ? qso.stations.A.call : qso.stations.B.call;
        return (
          <div key={i} data-line={i} class={`line ${line.station} ${currentLine === i ? 'current' : ''}`}>
            <div class="row">
              <span class="who spacer">{line.silent ? 'あなたの送信 (再生しません)' : call}</span>
              {!line.silent && phase === 'review' && (
                <button class="btn" style={{ minHeight: '32px', padding: '2px 10px' }} onClick={() => void playLines(qso, voices, i)} aria-label="この行を再生">
                  ▶
                </button>
              )}
            </div>
            <div class="en">{renderWords(line.text)}</div>
            {withJa && <div class="ja">{line.ja}</div>}
          </div>
        );
      })}
    </div>
  );

  if (phase === 'review' && results) {
    const correct = Object.values(results).filter(Boolean).length;
    return (
      <div class="session">
        <TopBar title="答え合わせ" back={() => setPhase('setup')} />
        <Card>
          <div class={`result-big ${correct === qso.questions.length ? 'ok' : 'ng'}`}>
            {correct} / {qso.questions.length}
          </div>
          <div class="stack">
            {qso.questions.map((q) => (
              <div key={q.id} class={`question ${results[q.id] ? 'ok' : 'ng'}`}>
                <span class="q-label">{q.label}</span>
                <span class="q-input">{(answers[q.id] ?? []).join('') || '(未入力)'}</span>
                {!results[q.id] && <span class="q-answer">正解: <b class="mono">{q.answer}</b></span>}
              </div>
            ))}
          </div>
        </Card>
        <Card title="交信の全文と意味">
          <p class="muted small" style={{ marginTop: 0 }}>
            点線の語をタップすると意味が出ます。▶ でその行だけ再生できます。
          </p>
          {glossInfo && (
            <div class="gloss">
              <b class="mono">{glossInfo.label}</b> — {glossInfo.meaning}
              {glossInfo.en ? ` (${glossInfo.en})` : ''}
            </div>
          )}
          {transcript(true)}
        </Card>
        <div class="stack">
          <button class="btn primary block big" onClick={start}>
            次の交信
          </button>
          <button
            class="btn block"
            onClick={() => {
              setResults(null);
              setPhase('listen');
              void playLines(qso, voices);
            }}
          >
            同じ交信をもう一度聞く
          </button>
          <button class="btn block ghost" onClick={() => navigate('/practice')}>
            練習メニューへ
          </button>
        </div>
      </div>
    );
  }

  // 聞き取り中
  return (
    <div class="session">
      <TopBar
        title={qsoKindLabel(qso.kind)}
        back={() => {
          stop();
          setPhase('setup');
        }}
      />
      <p class="muted small" style={{ margin: 0 }}>
        {qso.intro}
      </p>
      <div class="btn-row">
        {playing ? (
          <button class="btn" onClick={stop}>
            ■ 停止
          </button>
        ) : (
          <button class="btn" onClick={() => void playLines(qso, voices)}>
            ▶ 最初から再生
          </button>
        )}
        <button class="btn" onClick={() => setShowText((v) => !v)}>
          {showText ? '文を隠す' : '文を見る'}
        </button>
      </div>
      {showText && <Card>{transcript(false, true)}</Card>}
      <div class="stack">
        {qso.questions.map((q) => (
          <button key={q.id} class={`question ${focus === q.id ? 'focus' : ''}`} onClick={() => setFocus(q.id)}>
            <span class="q-label">{q.label}</span>
            <span class="q-input">
              <TokenText tokens={answers[q.id] ?? []} />
              {focus === q.id && <span class="caret" />}
            </span>
          </button>
        ))}
      </div>
      <button class="btn primary block" onClick={check}>
        答え合わせ
      </button>
      <div style={{ position: 'sticky', bottom: 0, background: 'var(--bg)', paddingTop: '8px' }}>
        <Keypad onKey={type} onBackspace={backspace} onSpace={() => type(' ')} onSubmit={nextField} submitLabel="次の欄" />
      </div>
    </div>
  );
}
