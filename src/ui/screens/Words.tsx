import { useEffect, useRef, useState } from 'preact/hooks';
import { audio } from '../../audio/engine';
import { canSpeak, speak, stopSpeaking, vibrate } from '../../audio/device';
import { lookupAbbrev } from '../../core/data/abbreviations';
import { COMMON_WORDS, QSO_WORDS } from '../../core/data/words';
import { wordsWithin } from '../../core/generators';
import { MAX_LESSON, lessonChars } from '../../core/koch';
import { tokenize } from '../../core/morse';
import { createRng, pick } from '../../core/rng';
import { score, stripSpaces, type ScoreResult } from '../../core/scoring';
import { recordAlignment } from '../../core/stats';
import { activeConditions, progress, settings, updateProgress, updateSettings } from '../../state/store';
import { Card, Segmented, TokenText, ToggleField, TopBar, percent } from '../components/common';
import { DiffView } from '../components/DiffView';
import { Keypad } from '../components/Keypad';
import { SpeedControl } from '../components/SpeedControl';
import { keyToToken, timingOf, toneOf, useKeyboard, usePracticeTimer, useSessionGuards } from '../hooks';
import { navigate } from '../router';

type Category = 'qso' | 'common' | 'mixed';
type Mode = 'type' | 'listen';
type Phase = 'setup' | 'run' | 'result';

const COUNT = 20;

function sourceWords(cat: Category): readonly string[] {
  if (cat === 'qso') return QSO_WORDS;
  if (cat === 'common') return COMMON_WORDS;
  return [...QSO_WORDS, ...COMMON_WORDS];
}

export function Words() {
  const learned = lessonChars(progress.value.kochLesson);
  const allLearned = progress.value.kochLesson >= MAX_LESSON;
  const [cat, setCat] = useState<Category>('qso');
  const [mode, setMode] = useState<Mode>('type');
  const [learnedOnly, setLearnedOnly] = useState(!allLearned);
  const [speakAnswer, setSpeakAnswer] = useState(true);
  const [phase, setPhase] = useState<Phase>('setup');
  const [word, setWord] = useState('');
  const [input, setInput] = useState<string[]>([]);
  const [checked, setChecked] = useState<ScoreResult | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [history, setHistory] = useState<{ word: string; ok: boolean }[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const running = useRef(false);
  const rng = useRef(createRng());

  const pool = learnedOnly ? wordsWithin(sourceWords(cat), learned) : [...sourceWords(cat)];
  const conditions = activeConditions('words');

  useSessionGuards(phase === 'run');
  usePracticeTimer(phase === 'run');
  useEffect(
    () => () => {
      running.current = false;
      clearTimeout(timer.current);
    },
    [],
  );

  const play = (w: string) => audio.play([{ text: w, timing: timingOf() }], { tone: toneOf(), conditions });

  const nextWord = (prev: string) => {
    let w = pick(rng.current, pool);
    for (let i = 0; i < 5 && w === prev && pool.length > 1; i++) w = pick(rng.current, pool);
    return w;
  };

  const askTyped = (prev: string) => {
    const w = nextWord(prev);
    setWord(w);
    setInput([]);
    setChecked(null);
    timer.current = window.setTimeout(() => void play(w), 250);
  };

  /** 聞くだけモード: 再生 → 考える時間 → 答えを表示 (読み上げ) → 次 */
  const listenLoop = async (count: number, prev: string) => {
    if (!running.current) return;
    if (count >= COUNT) {
      running.current = false;
      setPhase('result');
      return;
    }
    const w = nextWord(prev);
    setWord(w);
    setRevealed(false);
    const finished = await play(w);
    if (!finished || !running.current) return;
    await new Promise((r) => (timer.current = window.setTimeout(r, 2200)));
    if (!running.current) return;
    setRevealed(true);
    setHistory((h) => [...h, { word: w, ok: true }]);
    if (speakAnswer && canSpeak()) await speak(w, !COMMON_WORDS.includes(w));
    await new Promise((r) => (timer.current = window.setTimeout(r, 1200)));
    void listenLoop(count + 1, w);
  };

  const start = () => {
    if (pool.length === 0) return;
    setHistory([]);
    setPhase('run');
    if (mode === 'type') {
      askTyped('');
    } else {
      running.current = true;
      void listenLoop(0, '');
    }
  };

  const stopListening = () => {
    running.current = false;
    clearTimeout(timer.current);
    audio.stop();
    stopSpeaking();
  };

  const submit = () => {
    if (checked || mode !== 'type') return;
    const ref = stripSpaces(tokenize(word));
    const r = score(ref, stripSpaces(input));
    setChecked(r);
    const ok = r.errors === 0;
    if (!ok) vibrate(60);
    const all = [...history, { word, ok }];
    setHistory(all);
    updateProgress((p) => ({ ...p, charStats: recordAlignment(p.charStats, r.ops) }));
    if (all.length >= COUNT) {
      updateProgress((p) => ({
        ...p,
        wordHistory: [...p.wordHistory, { date: new Date().toISOString(), correct: all.filter((h) => h.ok).length, total: all.length }].slice(-300),
      }));
    }
    if (settings.value.autoAdvance && ok) timer.current = window.setTimeout(() => advance(all), 1400);
  };

  const advance = (all = history) => {
    clearTimeout(timer.current);
    if (all.length >= COUNT) {
      setPhase('result');
      return;
    }
    askTyped(word);
  };

  const onKey = (t: string) => {
    if (checked) return;
    setInput((i) => [...i, t]);
  };

  useKeyboard((key, e) => {
    if (phase !== 'run' || mode !== 'type') return;
    if (key === 'Backspace') {
      e.preventDefault();
      setInput((i) => i.slice(0, -1));
    } else if (key === 'Enter') {
      e.preventDefault();
      if (checked) advance();
      else submit();
    } else {
      const t = keyToToken(key);
      if (t) onKey(t);
    }
  }, phase === 'run');

  const meaning = lookupAbbrev(word);

  if (phase === 'setup') {
    return (
      <div class="session">
        <TopBar title="単語・略語" back="/practice" />
        <Card>
          <div class="stack">
            <Segmented
              value={cat}
              options={[
                { value: 'qso', label: '交信の略語' },
                { value: 'common', label: '英単語' },
                { value: 'mixed', label: 'まぜる' },
              ]}
              onChange={setCat}
            />
            <Segmented
              value={mode}
              options={[
                { value: 'type', label: '入力して答える' },
                { value: 'listen', label: '聞くだけ (答えを表示)' },
              ]}
              onChange={setMode}
            />
          </div>
          <ToggleField
            label="習得済みの文字だけで出題"
            desc={`Koch 講座で覚えた ${learned.length} 文字だけでできた語を選びます (現在 ${wordsWithin(sourceWords(cat), learned).length} 語)。`}
            checked={learnedOnly}
            onChange={setLearnedOnly}
          />
          {mode === 'listen' && (
            <ToggleField
              label="答えを読み上げる"
              desc={canSpeak() ? '端末の音声合成で英語の読みを再生します。' : 'この端末では音声合成が使えません。'}
              checked={speakAnswer}
              onChange={setSpeakAnswer}
            />
          )}
          <ToggleField
            label="ノイズなどの受信環境を使う"
            checked={settings.value.conditionsOn.words}
            onChange={(v) => updateSettings({ conditionsOn: { ...settings.value.conditionsOn, words: v } })}
          />
          <div class="field">
            <SpeedControl />
          </div>
        </Card>
        {pool.length === 0 ? (
          <div class="notice">習得済みの文字だけでできた語がまだありません。Koch 講座を進めるか、「習得済みの文字だけ」を OFF にしてください。</div>
        ) : (
          <button class="btn primary block big" onClick={start}>
            始める ({COUNT} 語)
          </button>
        )}
      </div>
    );
  }

  if (phase === 'result') {
    const ok = history.filter((h) => h.ok).length;
    return (
      <div class="session">
        <TopBar title="単語・略語の結果" back="/practice" />
        <Card>
          {mode === 'type' ? (
            <>
              <div class={`result-big ${ok / Math.max(1, history.length) >= 0.9 ? 'ok' : 'ng'}`}>{percent(ok / Math.max(1, history.length))}</div>
              <p class="center" style={{ margin: 0 }}>
                {ok} / {history.length} 語
              </p>
            </>
          ) : (
            <p class="center">{history.length} 語を聞きました。</p>
          )}
        </Card>
        {history.some((h) => !h.ok) && (
          <Card title="間違えた語">
            {history
              .filter((h) => !h.ok)
              .map((h, i) => (
                <button key={i} class="list-item" onClick={() => void play(h.word)}>
                  <span class="code">{h.word}</span>
                  <span class="muted small">{lookupAbbrev(h.word)?.meaning ?? ''}</span>
                </button>
              ))}
          </Card>
        )}
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

  if (mode === 'listen') {
    return (
      <div class="session">
        <TopBar
          title="単語・略語 (聞くだけ)"
          back={() => {
            stopListening();
            setPhase('setup');
          }}
        />
        <div class="session-info">
          <span>
            <b>{Math.min(history.length + (revealed ? 0 : 1), COUNT)}</b> / {COUNT}
          </span>
        </div>
        <div class="answer-area" style={{ minHeight: '220px' }} aria-live="polite">
          {revealed ? (
            <>
              <div class="big-char" style={{ fontSize: '3rem' }}>
                <TokenText tokens={tokenize(word)} />
              </div>
              {meaning && <div class="muted">{meaning.meaning}</div>}
            </>
          ) : (
            <div class="muted">頭の中で文字を思い浮かべてください…</div>
          )}
        </div>
        <button
          class="btn block big"
          onClick={() => {
            stopListening();
            setPhase('result');
          }}
        >
          ■ 終了
        </button>
      </div>
    );
  }

  return (
    <div class="session">
      <TopBar
        title="単語・略語"
        back={() => {
          audio.stop();
          clearTimeout(timer.current);
          setPhase('setup');
        }}
      />
      <div class="session-info">
        <span>
          <b>{Math.min(history.length + (checked ? 0 : 1), COUNT)}</b> / {COUNT}
        </span>
        <span class="spacer" />
        <button class="btn" onClick={() => void play(word)}>
          ↻ もう一度聞く
        </button>
      </div>
      <div class="answer-area" aria-live="polite">
        {checked ? (
          <>
            <DiffView ops={checked.ops} />
            {meaning && <div class="muted small center">{meaning.meaning}</div>}
            {!(settings.value.autoAdvance && checked.errors === 0) && (
              <button class="btn primary" onClick={() => advance()}>
                次へ
              </button>
            )}
          </>
        ) : (
          <div class="typed">
            {input.length ? <TokenText tokens={input} /> : <span class="muted small">聞こえた語を入力</span>}
            <span class="caret" />
          </div>
        )}
      </div>
      <div class="spacer" />
      <Keypad
        keys={learnedOnly ? learned : undefined}
        onKey={onKey}
        onBackspace={() => !checked && setInput((i) => i.slice(0, -1))}
        onSubmit={checked ? () => advance() : submit}
        submitLabel={checked ? '次へ' : '答え合わせ'}
      />
    </div>
  );
}
