import { MAX_LESSON, lessonChars, newCharsOf } from '../../core/koch';
import { progress, settings, streakDays, today } from '../../state/store';
import { Card, ProgressBar, Tok, TopBar, percent } from '../components/common';
import { navigate } from '../router';

export function Home() {
  const p = progress.value;
  const s = settings.value;
  const lesson = p.kochLesson;
  const chars = lessonChars(lesson);
  const newChars = newCharsOf(lesson);
  const todayMin = Math.round((p.practiceLog[today()] ?? 0) / 60);
  const streak = streakDays(p.practiceLog);
  const lastForLesson = [...p.kochHistory].reverse().find((h) => h.lesson === lesson && h.mode !== 'group');
  const done = lesson >= MAX_LESSON && p.kochHistory.some((h) => h.lesson === MAX_LESSON && h.accuracy >= 0.9);
  const firstTime = p.kochHistory.length === 0;

  return (
    <div>
      <TopBar title="モールス受信トレーナー" />
      {firstTime && (
        <div class="notice">
          ようこそ！ このアプリは <b>Koch 法</b> で、実際の交信の速さの音のまま 2 文字から覚えていきます。まずは下の「レッスン 1」から。使い方は
          <a href="#/ref?tab=guide">学習ガイド</a>にまとめています。
        </div>
      )}
      <Card>
        <div class="stat-row">
          <div>
            <b>{todayMin}</b>
            <span>今日の練習 (分)</span>
          </div>
          <div>
            <b>{streak}</b>
            <span>連続日数</span>
          </div>
          <div>
            <b>
              {s.charWpm}/{s.effWpm}
            </b>
            <span>文字/実効 WPM</span>
          </div>
        </div>
      </Card>

      <Card title="Koch 法 講座">
        <div class="row small">
          <span>
            レッスン <b>{lesson}</b> / {MAX_LESSON}
          </span>
          <span class="spacer" />
          <span class="muted">{chars.length} 文字</span>
        </div>
        <ProgressBar value={(lesson - 1) / (MAX_LESSON - 1)} />
        <div class="chips" style={{ margin: '12px 0' }}>
          {chars.map((c) => (
            <span key={c} class={`chip ${newChars.includes(c) ? 'new' : ''}`}>
              <Tok t={c} />
            </span>
          ))}
        </div>
        {lastForLesson && (
          <p class="muted small" style={{ marginTop: 0 }}>
            前回の正答率: {percent(lastForLesson.accuracy)} (合格ライン 90%)
          </p>
        )}
        <button class="btn primary block big" onClick={() => navigate(`/koch?lesson=${lesson}`)}>
          {done ? '最終レッスンを復習する' : `レッスン ${lesson} を始める`}
        </button>
        {lesson > 1 && (
          <details style={{ marginTop: '10px' }}>
            <summary class="small">前のレッスンを復習する</summary>
            <div class="chips" style={{ marginTop: '8px' }}>
              {Array.from({ length: lesson - 1 }, (_, i) => i + 1).map((l) => (
                <button key={l} class="chip" onClick={() => navigate(`/koch?lesson=${l}`)}>
                  {l}
                </button>
              ))}
            </div>
          </details>
        )}
      </Card>

      <Card title="次にやること">
        <p class="small" style={{ marginTop: 0 }}>{advice(lesson, done)}</p>
        <div class="btn-row">
          <button class="btn" onClick={() => navigate('/icr')}>
            瞬時認識ドリル
          </button>
          <button class="btn" onClick={() => navigate('/practice')}>
            練習メニュー
          </button>
        </div>
      </Card>
    </div>
  );
}

function advice(lesson: number, done: boolean): string {
  if (done) {
    return '全文字を習得しました。コールサイン → CQ → 定型 QSO → コンテストの順に実戦形式へ進み、慣れたら設定で実効速度を上げ、受信環境 (ノイズ・フェージング) も強くしていきましょう。';
  }
  if (lesson <= 5) {
    return '1 日 10〜20 分、短くても毎日続けるのが一番の近道です。間違えても止まらず、次の文字に集中しましょう。';
  }
  if (lesson <= 20) {
    return 'レッスンの合間に「瞬時認識ドリル」で反応を速くすると、グループの聞き取りが楽になります。文字が増えて苦しくなったら、実効速度を少し下げても構いません (文字速度は下げないのがコツ)。';
  }
  return '数字と記号が加わってきました。「単語・略語」の練習 (習得済みの文字だけ) で、交信によく出る語の音の形にも慣れていきましょう。';
}
